// Runs the PC/SC reader code in its own process. Initialising nfc-pcsc can block
// the whole process (e.g. when the Windows Smart Card service is not running),
// which must not take the HTTP server down with it.
import { NFC } from 'nfc-pcsc';

const send = message => {
    if (process.connected) process.send(message);
};

const nfc = new NFC();

nfc.on('reader', reader => {
    const name = reader.reader.name;
    send({ type: 'reader', name });

    reader.on('card', card => {
        send({
            type: 'card',
            name,
            card: { uid: card.uid, atr: card.atr, standard: card.standard, type: card.type }
        });
    });
    reader.on('card.off', card => send({ type: 'card.off', name, uid: card.uid }));
    reader.on('error', err => send({ type: 'reader.error', name, message: err.message }));
    reader.on('end', () => send({ type: 'reader.end', name }));
});

nfc.on('error', err => send({ type: 'nfc.error', message: err.message }));

process.on('disconnect', () => process.exit(0));
send({ type: 'ready' });
