use std::net::SocketAddr;

use anyhow::{Context, Result};
use tokio::net::UdpSocket;

use crate::protocol::{ReceivedVoicePacket, VoicePacket};

pub struct VoiceSocket {
    socket: UdpSocket,
    remote_addr: Option<SocketAddr>,
}

impl VoiceSocket {
    pub async fn bind(port: u16) -> Result<Self> {
        let addr = format!("0.0.0.0:{port}");
        let socket = UdpSocket::bind(&addr)
            .await
            .context(format!("Failed to bind UDP socket on {addr}"))?;

        let local = socket.local_addr()?;
        tracing::info!("Voice UDP socket bound to {local}");

        Ok(Self {
            socket,
            remote_addr: None,
        })
    }

    pub fn set_remote(&mut self, addr: SocketAddr) {
        self.remote_addr = Some(addr);
    }

    pub fn local_addr(&self) -> Result<SocketAddr> {
        self.socket.local_addr().context("Get local addr")
    }

    pub async fn send(&self, packet: &VoicePacket) -> Result<()> {
        let addr = self.remote_addr.context("No remote address set")?;
        let data = packet.serialize();
        self.socket
            .send_to(&data, addr)
            .await
            .context("UDP send failed")?;
        Ok(())
    }

    pub async fn recv(&self) -> Result<(VoicePacket, SocketAddr)> {
        let mut buf = [0u8; 2048];
        let (len, from) = self
            .socket
            .recv_from(&mut buf)
            .await
            .context("UDP recv failed")?;
        let packet = VoicePacket::deserialize(&buf[..len])?;
        Ok((packet, from))
    }

    pub async fn recv_from_hub(&self) -> Result<(ReceivedVoicePacket, SocketAddr)> {
        let mut buf = [0u8; 2048];
        let (len, from) = self
            .socket
            .recv_from(&mut buf)
            .await
            .context("UDP recv failed")?;
        let packet = ReceivedVoicePacket::deserialize(&buf[..len])?;
        Ok((packet, from))
    }

    /// Receive raw bytes from the socket without any parsing. Used by callers
    /// that need to inspect the first bytes before deciding how to interpret
    /// the packet (e.g. to detect the 4-byte VXRA registration ack before
    /// handing audio packets to the normal deserialiser).
    pub async fn recv_raw(&self) -> Result<(Vec<u8>, SocketAddr)> {
        let mut buf = [0u8; 2048];
        let (len, from) = self
            .socket
            .recv_from(&mut buf)
            .await
            .context("UDP recv failed")?;
        Ok((buf[..len].to_vec(), from))
    }

    /// Send raw bytes to the hub's UDP endpoint.
    pub async fn send_raw(&self, data: &[u8]) -> Result<()> {
        let addr = self.remote_addr.context("No remote address set")?;
        self.socket
            .send_to(data, addr)
            .await
            .context("UDP send_raw failed")?;
        Ok(())
    }
}
