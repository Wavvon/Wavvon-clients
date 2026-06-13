use anyhow::{Context, Result};
use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};
use std::io::Cursor;

pub const SAMPLE_RATE: u32 = 48_000;
pub const CHANNELS: u16 = 1;
pub const FRAME_DURATION_MS: u32 = 20;
pub const FRAME_SIZE: usize = 960;
pub const MAX_PACKET_SIZE: usize = 1275;
pub const RING_BUFFER_SIZE: usize = 9600;

/// Wire format: [sequence: u16][timestamp: u32][opus_data: variable]
/// Header: 6 bytes. Max total: 6 + 1275 = 1281 bytes (well under UDP MTU).
pub struct VoicePacket {
    pub sequence: u16,
    pub timestamp: u32,
    pub opus_data: Vec<u8>,
}

impl VoicePacket {
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(6 + self.opus_data.len());
        buf.write_u16::<BigEndian>(self.sequence).unwrap();
        buf.write_u32::<BigEndian>(self.timestamp).unwrap();
        buf.extend_from_slice(&self.opus_data);
        buf
    }

    pub fn deserialize(data: &[u8]) -> Result<Self> {
        if data.len() < 6 {
            anyhow::bail!("Packet too short: {} bytes", data.len());
        }
        let mut cursor = Cursor::new(data);
        let sequence = cursor.read_u16::<BigEndian>().context("Read sequence")?;
        let timestamp = cursor.read_u32::<BigEndian>().context("Read timestamp")?;
        let opus_data = data[6..].to_vec();

        Ok(Self {
            sequence,
            timestamp,
            opus_data,
        })
    }
}

/// Wire format for packets received FROM the hub (with sender_id and packet_type prepended):
/// [sender_id: u16][packet_type: u8][seq: u16][timestamp: u32][opus_data: variable]
/// Header: 9 bytes.
///
/// Backward compat: old 8-byte format [sender_id: u16][seq: u16][timestamp: u32][opus_data]
/// is accepted and treated as packet_type = 0x00 (normal voice).
pub struct ReceivedVoicePacket {
    pub sender_id: u16,
    /// 0x00 = normal channel voice, 0x01 = whisper (hub-routed).
    pub packet_type: u8,
    pub sequence: u16,
    pub timestamp: u32,
    pub opus_data: Vec<u8>,
}

impl ReceivedVoicePacket {
    /// Returns true when this packet carries whisper audio (`packet_type == 0x01`).
    pub fn is_whisper(&self) -> bool {
        self.packet_type == 0x01
    }

    pub fn deserialize(data: &[u8]) -> Result<Self> {
        if data.len() >= 9 {
            // New 9-byte header.
            let sender_id = u16::from_be_bytes([data[0], data[1]]);
            let packet_type = data[2];
            let sequence = u16::from_be_bytes([data[3], data[4]]);
            let timestamp = u32::from_be_bytes([data[5], data[6], data[7], data[8]]);
            let opus_data = data[9..].to_vec();
            return Ok(Self { sender_id, packet_type, sequence, timestamp, opus_data });
        }
        if data.len() >= 8 {
            // Backward compat: old 8-byte header — no packet_type byte.
            let sender_id = u16::from_be_bytes([data[0], data[1]]);
            let sequence = u16::from_be_bytes([data[2], data[3]]);
            let timestamp = u32::from_be_bytes([data[4], data[5], data[6], data[7]]);
            let opus_data = data[8..].to_vec();
            return Ok(Self { sender_id, packet_type: 0x00, sequence, timestamp, opus_data });
        }
        anyhow::bail!("Received packet too short: {} bytes", data.len());
    }
}
