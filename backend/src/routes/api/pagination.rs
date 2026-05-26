use serde::Deserialize;

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 200;

/// `?limit=N&before_slot=S` cursor. `before_slot` lets the client page
/// backwards through time without skipping rows when new ones arrive at
/// the head — offset pagination would shift those into the next page.
#[derive(Deserialize)]
pub struct Cursor {
    pub limit: Option<i64>,
    pub before_slot: Option<i64>,
}

impl Cursor {
    pub fn limit(&self) -> i64 {
        self.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limit_defaults_when_unset() {
        let c = Cursor {
            limit: None,
            before_slot: None,
        };
        assert_eq!(c.limit(), DEFAULT_LIMIT);
    }

    #[test]
    fn limit_clamps_to_max() {
        let c = Cursor {
            limit: Some(10_000),
            before_slot: None,
        };
        assert_eq!(c.limit(), MAX_LIMIT);
    }

    #[test]
    fn limit_clamps_to_min() {
        let c = Cursor {
            limit: Some(0),
            before_slot: None,
        };
        assert_eq!(c.limit(), 1);
        let c = Cursor {
            limit: Some(-5),
            before_slot: None,
        };
        assert_eq!(c.limit(), 1);
    }

    #[test]
    fn limit_passes_through_normal_values() {
        let c = Cursor {
            limit: Some(25),
            before_slot: None,
        };
        assert_eq!(c.limit(), 25);
    }
}
