//! The WebRTC adapter against a stand-in for the hub: an ICE-lite str0m peer
//! that answers the offer and echoes what arrives on the voice channel, the
//! shape of the hub relay (voice-transport-v3.md). Real UDP on loopback.

use std::net::SocketAddr;
use std::time::{Duration, Instant};

use str0m::change::SdpOffer;
use str0m::channel::{ChannelConfig, Reliability};
use str0m::net::{Protocol, Receive};
use str0m::{Candidate, Event, Input, Output, Rtc};
use tokio::net::UdpSocket;
use wavvon_voice::transport::RtcOffer;

/// Answers `offer_sdp` like the hub does and echoes channel data back with a
/// marker byte, until the process ends.
async fn fake_hub(offer_sdp: String) -> String {
    let socket = UdpSocket::bind("127.0.0.1:0").await.unwrap();
    let local: SocketAddr = socket.local_addr().unwrap();
    let mut rtc = Rtc::builder().set_ice_lite(true).build(Instant::now());
    rtc.add_local_candidate(Candidate::host(local, "udp").unwrap());
    let answer = rtc
        .sdp_api()
        .accept_offer(SdpOffer::from_sdp_string(&offer_sdp).unwrap())
        .unwrap();
    let channel = rtc.direct_api().create_data_channel(ChannelConfig {
        label: "voice".to_string(),
        ordered: false,
        reliability: Reliability::MaxRetransmits { retransmits: 0 },
        negotiated: Some(0),
        protocol: String::new(),
    });
    tokio::spawn(async move {
        let mut buf = vec![0u8; 2000];
        loop {
            let mut echo = Vec::new();
            let deadline = loop {
                match rtc.poll_output().unwrap() {
                    Output::Timeout(t) => break t,
                    Output::Transmit(t) => {
                        let _ = socket.send_to(&t.contents, t.destination).await;
                    }
                    Output::Event(Event::ChannelData(d)) => echo.push(d.data),
                    Output::Event(_) => {}
                }
            };
            for mut packet in echo {
                packet.insert(0, 0xEE);
                if let Some(mut ch) = rtc.channel(channel) {
                    let _ = ch.write(true, &packet);
                }
            }
            let wait = deadline
                .saturating_duration_since(Instant::now())
                .min(Duration::from_millis(20));
            if let Ok(Ok((n, source))) =
                tokio::time::timeout(wait, socket.recv_from(&mut buf)).await
            {
                if let Ok(contents) = buf[..n].try_into() {
                    let _ = rtc.handle_input(Input::Receive(
                        Instant::now(),
                        Receive {
                            proto: Protocol::Udp,
                            source,
                            destination: local,
                            contents,
                        },
                    ));
                }
            }
            let _ = rtc.handle_input(Input::Timeout(Instant::now()));
        }
    });
    answer.to_sdp_string()
}

#[tokio::test]
async fn packets_round_trip_over_the_data_channel() {
    let (offer, sdp) = RtcOffer::new("127.0.0.1").await.unwrap();
    let answer = fake_hub(sdp).await;
    let transport = offer.accept(&answer).unwrap();

    let echoed = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            transport.send_datagram(b"sealed").unwrap();
            if let Ok(Ok(p)) =
                tokio::time::timeout(Duration::from_millis(100), transport.recv_datagram()).await
            {
                return p;
            }
        }
    })
    .await
    .expect("no echo over the data channel");
    assert_eq!(echoed, b"\xEEsealed");
}
