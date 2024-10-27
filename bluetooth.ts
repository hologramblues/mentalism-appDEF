import { BleClient } from '@capacitor/bluetooth-le';

const PEEKSMITH_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
const PEEKSMITH_CHARACTERISTIC = '0000ffe1-0000-1000-8000-00805f9b34fb';

export class BluetoothService {
  static async initialize() {
    await BleClient.initialize();
  }

  static async scanForPeekSmith(onDeviceFound: (deviceId: string) => void) {
    await BleClient.requestLEScan(
      {
        services: [PEEKSMITH_SERVICE],
      },
      (result) => {
        onDeviceFound(result.device.deviceId);
      }
    );

    // Arrêter le scan après 5 secondes
    setTimeout(async () => {
      await BleClient.stopLEScan();
    }, 5000);
  }

  static async connect(deviceId: string) {
    await BleClient.connect(deviceId);
  }

  static async startNotifications(
    deviceId: string,
    onData: (value: DataView) => void
  ) {
    await BleClient.startNotifications(
      deviceId,
      PEEKSMITH_SERVICE,
      PEEKSMITH_CHARACTERISTIC,
      onData
    );
  }

  static async write(deviceId: string, data: string) {
    const encoder = new TextEncoder();
    await BleClient.write(
      deviceId,
      PEEKSMITH_SERVICE,
      PEEKSMITH_CHARACTERISTIC,
      encoder.encode(data)
    );
  }

  static async disconnect(deviceId: string) {
    await BleClient.disconnect(deviceId);
  }
}
