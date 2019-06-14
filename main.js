const { MUSE_SERVICE, MuseClient } = require('./dist/muse');
const { filter, map, bufferCount } = require('rxjs/operators');
const noble = require('noble');
const bluetooth = require('bleat').webbluetooth;
const fs = require('fs');

const F_S = 256;
const F_C = 12;

async function connect() {
    let device = await bluetooth.requestDevice({
        filters: [{ services: [MUSE_SERVICE] }],
    });
    const gatt = await device.gatt.connect();
    const client = new MuseClient();
    await client.connect(gatt);
    await client.start();
    console.log(client.deviceName);

    const stream = fs.createWriteStream('out.csv');
    const aux = client.eegReadings.pipe(filter(({ electrode }) => electrode === 4));
    const BUF_LEN = 40;
    const sin = [...Array(BUF_LEN * 12).keys()].map((v) => {
        const arg = ((v * F_C) / F_S) * 2 * Math.PI;
        return [Math.sin(arg), Math.cos(arg)];
    });
    const P = aux.pipe(
        bufferCount(BUF_LEN), // 12 * 40 = 480 samples, for about 2 seconds of resolution
        map((v) =>
            v
                .reduce((l, v_) => l.concat(v_.samples), [])
                .reduce((a, v, i) => a + Math.sqrt(Math.pow(v * sin[i][0], 2) + Math.pow(v * sin[i][1], 2)), 0),
        ),
    );
    aux.subscribe((v) => {
        stream.write(`${v.index},${v.timestamp},${v.samples.join(',')}\n`);
        process.stdout.write(
            `${parseInt(v.timestamp)} | ${v.samples.reduce((a, x) => a + x * x, 0) / v.samples.length}\r`,
        );
    });
    // P.subscribe(console.log);
}

noble.on('stateChange', (state) => {
    if (state === 'poweredOn') {
        connect();
    }
});
