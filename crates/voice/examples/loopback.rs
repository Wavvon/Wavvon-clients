use anyhow::Result;
use wavvon_voice::AudioPipeline;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    println!("=== Wavvon Voice Loopback Test ===");
    println!("Speak into your microphone...");
    println!("You should hear yourself with a slight delay.");
    println!("Press Ctrl+C to stop.\n");

    let pipeline = AudioPipeline::start_loopback().await?;

    tokio::signal::ctrl_c().await?;

    println!("\nStopping...");
    pipeline.stop().await;

    Ok(())
}
