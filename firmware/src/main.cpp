/*
 * Magnetorrecepção na Raposa Ártica, firmware de telemetria magnética.
 *
 * Pipeline completa: QMC5883P (ou mock) -> Magnetometer (calibração hard-iron +
 * NVS + tare) -> FieldMath -> Telemetry -> NetServer (AP Wi-Fi + WebSocket @10 Hz).
 *
 * Conecte o notebook na rede RaposaArtica e aponte o cliente para
 * ws://192.168.4.1/ws. Comandos do contrato: {"cmd":"tare|calibrate|freeze"}.
 */
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Wire.h>

#include "FieldMath.h"
#include "Magnetometer.h"
#include "NetServer.h"
#include "Telemetry.h"

static const char* AP_SSID = "RaposaArtica";
static const char* AP_PASSWORD = "magnetismo";
static const unsigned long SAMPLE_INTERVAL_MS = 100;   // 10 Hz
static const unsigned long CALIBRATION_MS = 20000;     // janela da figura-8 (20 s)

// Heartbeat de depuração no serial (1 Hz). Útil para validar os valores reais
// pelo cabo, sem entrar na rede do AP. Comentar antes da apresentação.
#define DEBUG_SERIAL_HEARTBEAT 1

// DIAGNÓSTICO (Parte 1): força SDA(21) e SCL(22) em 0 V como saída push-pull.
// O GY-271 tem pull-ups próprios; medir no pino do sensor: ~0 V = linha conectada,
// ~3,3 V = linha rompida/coluna errada. Pôr 0 para voltar à demo normal.
#define DIAG_FORCE_LOW 0

Magnetometer mag;
NetServer net;
unsigned long lastSample = 0;
unsigned long calDeadline = 0;
bool frozen = false;
TelemetryState lastState;  // reemitido enquanto congelado

// Comandos chegam no callback async do WebSocket; só sinalizam flags, consumidas
// no loop() (toca I2C/NVS na thread principal, fora do contexto async).
volatile bool cmdTare = false;
volatile bool cmdFreeze = false;
volatile bool cmdCalibrate = false;

void handleCommand(const std::string& msg) {
  JsonDocument doc;
  if (deserializeJson(doc, msg)) return;  // ignora JSON inválido
  const char* cmd = doc["cmd"] | "";
  if (strcmp(cmd, "tare") == 0) cmdTare = true;
  else if (strcmp(cmd, "freeze") == 0) cmdFreeze = true;
  else if (strcmp(cmd, "calibrate") == 0) cmdCalibrate = true;
}

static const int PIN_SDA = 21;
static const int PIN_SCL = 22;

// Recuperação de barramento I2C por bit-bang. Se o ESP reiniciou no meio de uma
// transação, o escravo (alimentado pelo 3V3 do ESP, que não cai num reset por
// EN/serial) pode ficar segurando SDA em LOW, e aí o periférico I2C trava na
// primeira transação que tenta gerar START. Pulsamos SCL até 9x para o escravo
// terminar o byte e soltar SDA, e geramos um STOP manual. Chamar ANTES de
// Wire.begin(). Retorna o estado final de SDA (HIGH = barramento livre).
bool recoverI2CBus() {
  pinMode(PIN_SDA, INPUT_PULLUP);
  pinMode(PIN_SCL, INPUT_PULLUP);
  delayMicroseconds(10);
  const bool sdaStuck = (digitalRead(PIN_SDA) == LOW);
  if (sdaStuck) {
    pinMode(PIN_SCL, OUTPUT_OPEN_DRAIN);
    digitalWrite(PIN_SCL, HIGH);
    for (int i = 0; i < 9 && digitalRead(PIN_SDA) == LOW; i++) {
      digitalWrite(PIN_SCL, LOW);
      delayMicroseconds(10);
      digitalWrite(PIN_SCL, HIGH);
      delayMicroseconds(10);
    }
    // STOP manual: com SCL alto, SDA sobe de LOW para HIGH.
    pinMode(PIN_SDA, OUTPUT_OPEN_DRAIN);
    digitalWrite(PIN_SDA, LOW);
    delayMicroseconds(10);
    digitalWrite(PIN_SCL, HIGH);
    delayMicroseconds(10);
    digitalWrite(PIN_SDA, HIGH);
    delayMicroseconds(10);
    pinMode(PIN_SDA, INPUT_PULLUP);
  }
  const bool freeNow = (digitalRead(PIN_SDA) == HIGH);
  Serial.printf("I2C recovery: SDA %s -> %s\n", sdaStuck ? "PRESO" : "livre",
                freeNow ? "livre" : "AINDA PRESO");
  return freeNow;
}

// Confirma o QMC5883P no endereço esperado (0x2C). Uma única transação: o ACK é
// rápido se o sensor responde; um endereço vazio bate o timeout do barramento.
// (Varredura completa 0–126 é lenta demais para o boot, cada endereço vazio
// espera o timeout; aqui só interessa o 0x2C.)
void scanI2C() {
  // Endereços candidatos: 0x2C=QMC5883P (esperado), 0x0D=QMC5883L, 0x1E=HMC5883L.
  // Cobre o caso de o chip ter mudado de endereço sem varrer 0–126 (lento, 1s/end).
  const uint8_t candidates[] = {0x2C, 0x0D, 0x1E};
  for (uint8_t a : candidates) {
    Wire.beginTransmission(a);
    const bool ack = (Wire.endTransmission() == 0);
    Serial.printf("I2C probe 0x%02X: %s\n", a, ack ? "ACK!" : "sem resposta");
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println(F("\n=== Raposa Ártica, telemetria ==="));

#if DIAG_FORCE_LOW
  // A própria ESP lê o estado das linhas (sem pull interno): com pull-up do GY-271
  // e sem curto, ambas idle em ALTO. SCL em BAIXO = ainda preso/curto ao GND.
  pinMode(PIN_SDA, INPUT);
  pinMode(PIN_SCL, INPUT);
  Serial.println(F("[DIAG] Lendo nivel das linhas I2C (sem pull interno):"));
  Serial.println(F("[DIAG] esperado SDA=ALTO e SCL=ALTO. SCL=BAIXO -> ainda em curto."));
  while (true) {
    Serial.printf("[DIAG] SDA=%s  SCL=%s\n",
                  digitalRead(PIN_SDA) ? "ALTO" : "BAIXO",
                  digitalRead(PIN_SCL) ? "ALTO" : "BAIXO");
    delay(500);
  }
#endif

  recoverI2CBus();       // libera o barramento se ficou preso de um reset anterior
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setTimeOut(50);   // ms: o padrão (1000) deixa boot/probe lentos sem sensor
  scanI2C();
  mag.begin();
  Serial.printf("Magnetometer: %s | calibrado: %s\n",
                mag.isMock() ? "MOCK (sensor ausente)" : mag.chipName(),
                mag.isCalibrated() ? "sim (NVS)" : "nao");

  net.onCommand(handleCommand);
  net.begin(AP_SSID, AP_PASSWORD);
  Serial.printf("AP '%s' no ar. Telemetria em ws://192.168.4.1/ws\n", AP_SSID);
}

void loop() {
  net.loop();

  // --- Consumir comandos sinalizados pelo WebSocket ---
  if (cmdTare) { cmdTare = false; mag.toggleTare(); }
  if (cmdFreeze) { cmdFreeze = false; frozen = !frozen; }
  if (cmdCalibrate) {
    cmdCalibrate = false;
    mag.startCalibration();
    calDeadline = millis() + CALIBRATION_MS;
  }
  // Encerra a figura-8 quando a janela expira (não-bloqueante).
  if (mag.isCalibrating() && millis() >= calDeadline) mag.finishCalibration();

  // Se caímos no mock (sensor ausente no boot), re-tenta a cada 1 s: assim o
  // contato voltando (reseat de jumper) reconecta sozinho, sem reboot.
  static unsigned long lastReacquire = 0;
  if (mag.isMock() && millis() - lastReacquire >= 1000) {
    lastReacquire = millis();
    mag.tryReacquire();
  }

  const unsigned long now = millis();
  if (now - lastSample < SAMPLE_INTERVAL_MS) return;
  lastSample = now;

  if (!frozen) {
    const MagField b = mag.read();
    lastState.field = b;
    lastState.magnitude = FieldMath::magnitude(b);
    lastState.inclination = FieldMath::inclination(b);
    lastState.heading = FieldMath::heading(b);
    lastState.calibrated = mag.isCalibrated();
    lastState.calibrating = mag.isCalibrating();
  }
  // Congelado: mantém o vetor, mas avança o timestamp para o selo seguir "AO VIVO".
  lastState.t = now;

  net.broadcast(Telemetry::toJson(lastState));

#if DEBUG_SERIAL_HEARTBEAT
  static unsigned long lastBeat = 0;
  if (now - lastBeat >= 1000) {
    lastBeat = now;
    Serial.printf("%s B=(%.1f, %.1f, %.1f) µT | |B|=%.1f | I=%.1f° | head=%.1f° %s%s\n",
                  mag.isMock() ? "[MOCK]" : "[REAL]",
                  lastState.field.bx, lastState.field.by, lastState.field.bz,
                  lastState.magnitude, lastState.inclination, lastState.heading,
                  mag.isCalibrating() ? "[CALIBRANDO] " : "",
                  frozen ? "[FREEZE]" : "");
  }
#endif
}
