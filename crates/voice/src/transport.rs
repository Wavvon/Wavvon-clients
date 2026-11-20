//! The voice transport port (voice-transport-v3.md): one opaque-packet
//! surface, `send_datagram` / `recv_datagram`, over whichever transport the
//! hub offers. Packets are the sealed uplink packets from `crypto.rs`; the
//! encryption lives one layer up, this module is purely transport.
//!
//! Two adapters sit behind it: a WebRTC data channel (str0m) on hubs that
//! advertise `voice.webrtc`, and the WebTransport session of
//! voice-transport-v2.md, which goes once every hub has moved.

use std::net::{IpAddr, SocketAddr};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use str0m::change::{SdpAnswer, SdpPendingOffer};
use str0m::channel::{ChannelConfig, ChannelId, Reliability};
use str0m::net::{Protocol, Receive};
use str0m::{Candidate, Event, IceConnectionState, Input, Output, Rtc};
use tokio::net::UdpSocket;
use tokio::sync::{mpsc, Mutex};
use wtransport::tls::Sha256Digest;
use wtransport::{ClientConfig, Endpoint};

/// The data channel's stream id; both sides create it out of band.
const VOICE_CHANNEL_ID: u16 = 0;

/// An open voice session against a hub, on either transport.
pub struct VoiceTransport {
    link: Link,
}

enum Link {
    WebTransport(wtransport::Connection),
    WebRtc {
        outbound: mpsc::UnboundedSender<Vec<u8>>,
        inbound: Mutex<mpsc::UnboundedReceiver<Vec<u8>>>,
    },
}

impl VoiceTransport {
    /// Connects to `voice_wt_url?token=<voice_token>`. When `cert_hash_hex`
    /// is set (self-signed tier), trusts exactly that certificate by
    /// SHA-256 digest, matching the browser
    /// `WebTransportOptions.serverCertificateHashes` trust model; otherwise
    /// falls back to normal CA validation (operator-supplied cert).
    pub async fn connect(
        voice_wt_url: &str,
        voice_token: &str,
        cert_hash_hex: Option<&str>,
    ) -> Result<Self> {
        let builder = ClientConfig::builder().with_bind_default();
        let config = match cert_hash_hex {
            Some(hash_hex) => {
                let bytes = hex::decode(hash_hex).context("invalid voice_cert_hash hex")?;
                let digest: [u8; 32] = bytes.try_into().map_err(|_| {
                    anyhow::anyhow!("voice_cert_hash must be a 32-byte SHA-256 digest")
                })?;
                builder
                    .with_server_certificate_hashes([Sha256Digest::new(digest)])
                    .build()
            }
            None => builder.with_native_certs().build(),
        };

        let endpoint = Endpoint::client(config).context("wtransport client endpoint")?;
        let session_url = format!("{voice_wt_url}?token={voice_token}");
        let connection = endpoint
            .connect(&session_url)
            .await
            .context("wtransport connect")?;

        Ok(Self {
            link: Link::WebTransport(connection),
        })
    }

    /// Sends an unreliable, unordered packet -- the sealed uplink packet.
    pub fn send_datagram(&self, payload: &[u8]) -> Result<()> {
        match &self.link {
            Link::WebTransport(c) => c.send_datagram(payload).context("wtransport send_datagram"),
            Link::WebRtc { outbound, .. } => outbound
                .send(payload.to_vec())
                .map_err(|_| anyhow::anyhow!("voice WebRTC session closed")),
        }
    }

    /// Waits for the next packet from the hub relay (routing prefix +
    /// sealed packet, unparsed).
    pub async fn recv_datagram(&self) -> Result<Vec<u8>> {
        match &self.link {
            Link::WebTransport(c) => {
                let datagram = c
                    .receive_datagram()
                    .await
                    .context("wtransport receive_datagram")?;
                Ok(datagram.payload().to_vec())
            }
            Link::WebRtc { inbound, .. } => inbound
                .lock()
                .await
                .recv()
                .await
                .ok_or_else(|| anyhow::anyhow!("voice WebRTC session closed")),
        }
    }
}

/// A WebRTC voice offer waiting for the hub's answer. Built first, so its SDP
/// can go out as `voice_rtc_offer`; [`RtcOffer::accept`] takes the
/// `voice_rtc_answer` and starts the session.
pub struct RtcOffer {
    rtc: Rtc,
    socket: UdpSocket,
    local: SocketAddr,
    channel: ChannelId,
    pending: SdpPendingOffer,
}

impl RtcOffer {
    /// Prepares an offer for the hub at `hub_host` (the host of its URL),
    /// returning it with its SDP. The local candidate is the address the OS
    /// would route to that host from, which is what the hub's ICE-lite end
    /// will see.
    pub async fn new(hub_host: &str) -> Result<(Self, String)> {
        let local_ip = route_to(hub_host).await?;
        let socket = UdpSocket::bind((local_ip, 0))
            .await
            .context("bind voice WebRTC socket")?;
        let local = socket.local_addr()?;

        let mut rtc = Rtc::builder().build(Instant::now());
        rtc.add_local_candidate(Candidate::host(local, "udp").context("local candidate")?);
        let mut change = rtc.sdp_api();
        let channel = change.add_channel_with_config(ChannelConfig {
            label: "voice".to_string(),
            ordered: false,
            reliability: Reliability::MaxRetransmits { retransmits: 0 },
            negotiated: Some(VOICE_CHANNEL_ID),
            protocol: String::new(),
        });
        let (offer, pending) = change
            .apply()
            .ok_or_else(|| anyhow::anyhow!("no WebRTC offer to make"))?;
        Ok((
            Self {
                rtc,
                socket,
                local,
                channel,
                pending,
            },
            offer.to_sdp_string(),
        ))
    }

    /// Applies the hub's answer and starts the session's I/O task.
    pub fn accept(mut self, answer_sdp: &str) -> Result<VoiceTransport> {
        let answer = SdpAnswer::from_sdp_string(answer_sdp).context("invalid voice_rtc_answer")?;
        self.rtc
            .sdp_api()
            .accept_answer(self.pending, answer)
            .context("voice_rtc_answer refused")?;
        let (out_tx, out_rx) = mpsc::unbounded_channel();
        let (in_tx, in_rx) = mpsc::unbounded_channel();
        tokio::spawn(run(
            self.rtc,
            self.socket,
            self.local,
            self.channel,
            out_rx,
            in_tx,
        ));
        Ok(VoiceTransport {
            link: Link::WebRtc {
                outbound: out_tx,
                inbound: Mutex::new(in_rx),
            },
        })
    }
}

/// The local address the OS picks to reach `host`. Connecting a UDP socket
/// sends nothing; it only resolves the route.
async fn route_to(host: &str) -> Result<IpAddr> {
    let target = tokio::net::lookup_host((host, 9))
        .await
        .context("resolve hub host")?
        .find(|a| a.is_ipv4())
        .ok_or_else(|| anyhow::anyhow!("hub host has no IPv4 address"))?;
    let probe = UdpSocket::bind("0.0.0.0:0").await?;
    probe.connect(target).await.context("route to hub")?;
    Ok(probe.local_addr()?.ip())
}

/// Owns the socket and the str0m state until either side closes: dropping
/// the `VoiceTransport` closes `outbound`, and a dead ICE session closes
/// `inbound`.
async fn run(
    mut rtc: Rtc,
    socket: UdpSocket,
    local: SocketAddr,
    channel: ChannelId,
    mut outbound: mpsc::UnboundedReceiver<Vec<u8>>,
    inbound: mpsc::UnboundedSender<Vec<u8>>,
) {
    let mut buf = vec![0u8; 2000];
    loop {
        let deadline = loop {
            if !rtc.is_alive() {
                return;
            }
            match rtc.poll_output() {
                Ok(Output::Timeout(t)) => break t,
                Ok(Output::Transmit(t)) => {
                    let _ = socket.send_to(&t.contents, t.destination).await;
                }
                Ok(Output::Event(Event::ChannelData(d))) if d.id == channel => {
                    if inbound.send(d.data).is_err() {
                        return;
                    }
                }
                Ok(Output::Event(Event::IceConnectionStateChange(
                    IceConnectionState::Disconnected,
                ))) => {
                    tracing::warn!("voice WebRTC session disconnected");
                    return;
                }
                Ok(Output::Event(_)) => {}
                Err(e) => {
                    tracing::warn!("voice WebRTC session failed: {e}");
                    return;
                }
            }
        };
        let wait = deadline
            .saturating_duration_since(Instant::now())
            .min(Duration::from_millis(100));
        tokio::select! {
            received = socket.recv_from(&mut buf) => {
                if let Ok((n, source)) = received {
                    if let Ok(contents) = buf[..n].try_into() {
                        let input = Input::Receive(
                            Instant::now(),
                            Receive { proto: Protocol::Udp, source, destination: local, contents },
                        );
                        let _ = rtc.handle_input(input);
                    }
                }
            }
            packet = outbound.recv() => {
                let Some(packet) = packet else {
                    rtc.disconnect();
                    return;
                };
                if let Some(mut ch) = rtc.channel(channel) {
                    let _ = ch.write(true, &packet);
                }
            }
            _ = tokio::time::sleep(wait) => {}
        }
        let _ = rtc.handle_input(Input::Timeout(Instant::now()));
    }
}
