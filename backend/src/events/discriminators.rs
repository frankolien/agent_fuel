use sha2::{Digest, Sha256};

pub fn anchor_event_discriminator(event_name: &str) -> [u8; 8] {
    let mut hasher = Sha256::new();
    hasher.update(b"event:");
    hasher.update(event_name.as_bytes());
    let digest = hasher.finalize();
    let mut out = [0u8; 8];
    out.copy_from_slice(&digest[..8]);
    out
}

pub trait EventDescriptor {
    const NAME: &'static str;
    fn discriminator() -> [u8; 8];
}

#[macro_export]
macro_rules! __anchor_event_disc_impl {
    ($ty:ty, $name:literal) => {
        impl $crate::events::discriminators::EventDescriptor for $ty {
            const NAME: &'static str = $name;
            fn discriminator() -> [u8; 8] {
                static CELL: std::sync::OnceLock<[u8; 8]> = std::sync::OnceLock::new();
                *CELL.get_or_init(|| {
                    $crate::events::discriminators::anchor_event_discriminator($name)
                })
            }
        }
    };
}
