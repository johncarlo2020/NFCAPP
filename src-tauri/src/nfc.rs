use pcsc::{Context, Error, Protocols, ReaderState, Scope, ShareMode, State};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Default, Serialize, PartialEq)]
pub struct Status {
    pub readers: Vec<String>,
    pub cards: BTreeMap<String, CardData>,
    pub error: Option<String>,
}

#[derive(Clone, Serialize, PartialEq)]
pub struct CardData {
    pub uid: String,
    pub atr: String,
    pub reader: String,
}

pub struct SharedStatus(pub Arc<Mutex<Status>>);

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02X}")).collect()
}

fn parse_uid(response: &[u8]) -> Result<String, String> {
    if response.len() < 2 {
        return Err("Reader returned an incomplete UID response".into());
    }
    let (uid, status) = response.split_at(response.len() - 2);
    if status != [0x90, 0x00] {
        return Err(format!("Get UID command failed: {}", hex(status)));
    }
    if uid.is_empty() {
        return Err("Reader returned an empty UID".into());
    }
    Ok(hex(uid))
}

fn poll(ctx: &Context, previous: &Status) -> Result<Status, String> {
    let names = match ctx.list_readers_owned() {
        Ok(names) => names,
        Err(Error::NoReadersAvailable) => Vec::new(),
        Err(e) => return Err(format!("Cannot list PC/SC readers: {e}")),
    };
    let mut next = Status::default();
    for name in names {
        let label = name.to_string_lossy().into_owned();
        next.readers.push(label.clone());
        let mut states = [ReaderState::new(name.as_c_str(), State::UNAWARE)];
        if let Err(e) = ctx.get_status_change(Duration::from_millis(100), &mut states) {
            next.error = Some(format!("{label}: cannot check card presence: {e}"));
            continue;
        }
        if !states[0].event_state().contains(State::PRESENT)
            || states[0]
                .event_state()
                .intersects(State::UNKNOWN | State::UNAVAILABLE | State::MUTE)
        {
            continue;
        }
        if let Some(card) = previous.cards.get(&label) {
            next.cards.insert(label, card.clone());
            continue;
        }
        let read = || -> Result<CardData, String> {
            let card = ctx
                .connect(name.as_c_str(), ShareMode::Shared, Protocols::ANY)
                .map_err(|e| format!("Cannot connect to card: {e}"))?;
            let mut buffer = [0; pcsc::MAX_BUFFER_SIZE];
            // ACR122 Get Data: request the complete card UID. No card writes.
            let response = card
                .transmit(&[0xFF, 0xCA, 0x00, 0x00, 0x00], &mut buffer)
                .map_err(|e| format!("Cannot read UID: {e}"))?;
            Ok(CardData {
                uid: parse_uid(response)?,
                atr: hex(states[0].atr()),
                reader: label.clone(),
            })
        };
        match read() {
            Ok(card) => {
                next.cards.insert(label, card);
            }
            Err(e) => {
                next.error = Some(format!("{label}: {e}"));
            }
        }
    }
    next.readers.sort();
    Ok(next)
}

pub fn start(app: AppHandle, shared: Arc<Mutex<Status>>) {
    thread::spawn(move || {
        let mut context = None;
        let mut previous = Status::default();
        loop {
            if context.is_none() {
                match Context::establish(Scope::User) {
                    Ok(ctx) => context = Some(ctx),
                    Err(e) => publish(&app, &shared, &mut previous, Status {
                        error: Some(format!("PC/SC service unavailable. Check the reader driver and smart-card service: {e}")),
                        ..Status::default()
                    }),
                }
            }
            if let Some(ctx) = &context {
                match poll(ctx, &previous) {
                    Ok(next) => publish(&app, &shared, &mut previous, next),
                    Err(e) => {
                        publish(
                            &app,
                            &shared,
                            &mut previous,
                            Status {
                                error: Some(e),
                                ..Status::default()
                            },
                        );
                        context = None;
                    }
                }
            }
            thread::sleep(Duration::from_millis(300));
        }
    });
}

fn publish(app: &AppHandle, shared: &Arc<Mutex<Status>>, previous: &mut Status, next: Status) {
    if *previous != next {
        if let Ok(mut status) = shared.lock() {
            *status = next.clone();
        }
        let _ = app.emit("nfc-status", &next);
        *previous = next;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn uid_response_requires_success_and_data() {
        assert_eq!(parse_uid(&[0x04, 0xAB, 0x90, 0x00]).unwrap(), "04AB");
        assert!(parse_uid(&[0x63, 0x00]).is_err());
        assert!(parse_uid(&[0x90, 0x00]).is_err());
        assert!(parse_uid(&[0x90]).is_err());
    }
}
