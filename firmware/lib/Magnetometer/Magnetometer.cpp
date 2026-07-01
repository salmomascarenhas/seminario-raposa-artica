#include "Magnetometer.h"

#include <Arduino.h>
#include <Preferences.h>
#include <Wire.h>
#include <math.h>

namespace {
// Endereços I2C dos chips suportados (família GY-271/273).
constexpr uint8_t ADDR_QMC5883P = 0x2C;
constexpr uint8_t ADDR_QMC5883L = 0x0D;
constexpr uint8_t ADDR_HMC5883L = 0x1E;

// Conversões para µT. 1 Gauss = 100 µT.
constexpr float GAUSS_TO_UT = 100.0f;
// QMC5883L em faixa ±8 G: 3000 LSB/G -> µT = raw/3000*100 = raw/30.
constexpr float QMCL_LSB_TO_UT = 100.0f / 3000.0f;
// HMC5883L em ganho ±1.3 G (registro padrão 0x20): 1090 LSB/G -> µT = raw/1090*100.
constexpr float HMC_LSB_TO_UT = 100.0f / 1090.0f;

// Namespace/chaves da NVS para os offsets hard-iron.
constexpr const char* NVS_NS = "magcal";

// Ping I2C: true se o endereço responde (ACK).
bool i2cPresent(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}
// Escreve um byte num registrador.
void writeReg(uint8_t addr, uint8_t reg, uint8_t val) {
  Wire.beginTransmission(addr);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}
}  // namespace

bool Magnetometer::begin() {
  // Pequena folga de assentamento pós-energização antes de falar com o chip.
  delay(50);
  mock_ = !tryAcquire_();
  Serial.printf("Magnetometer: %s\n", mock_ ? "MOCK (nenhum sensor)" : chipName());
  loadCalibration_();
  return true;
}

const char* Magnetometer::chipName() const {
  switch (chip_) {
    case CHIP_QMC5883P: return "QMC5883P @0x2C";
    case CHIP_QMC5883L: return "QMC5883L @0x0D";
    case CHIP_HMC5883L: return "HMC5883L @0x1E";
    default: return "nenhum";
  }
}

bool Magnetometer::tryAcquire_() {
  // Ordem de preferência: QMC5883P (chip original), depois QMC5883L (o mais comum
  // nos "GY-271 HMC5883L" atuais), depois HMC5883L genuíno.
  if (i2cPresent(ADDR_QMC5883P) && qmcP_.begin(ADDR_QMC5883P, &Wire)) {
    // Faixa ±2 G (±200 µT): melhor resolução p/ o campo terrestre (~25–40 µT em
    // Sobral). Ímã/bobina de perto satura, tudo bem, o vetor "salta".
    qmcP_.setMode(QMC5883P_MODE_CONTINUOUS);
    qmcP_.setODR(QMC5883P_ODR_100HZ);
    qmcP_.setOSR(QMC5883P_OSR_8);
    qmcP_.setRange(QMC5883P_RANGE_2G);
    qmcP_.setSetResetMode(QMC5883P_SETRESET_ON);
    chip_ = CHIP_QMC5883P;
    return true;
  }
  if (i2cPresent(ADDR_QMC5883L) && initQMC5883L_()) {
    chip_ = CHIP_QMC5883L;
    return true;
  }
  if (i2cPresent(ADDR_HMC5883L) && initHMC5883L_()) {
    chip_ = CHIP_HMC5883L;
    return true;
  }
  chip_ = CHIP_NONE;
  return false;
}

bool Magnetometer::initQMC5883L_() {
  // SET/RESET period: valor recomendado pelo datasheet (0x0B = 0x01).
  writeReg(ADDR_QMC5883L, 0x0B, 0x01);
  // Control 1 (0x09): OSR=512 | RNG=±8G | ODR=200Hz | MODE=contínuo = 0x1D.
  // ±8 G dá folga para o ímã/bobina sem saturar tão fácil (sacrifica resolução,
  // ainda sobra muita para os ~30 µT da Terra: ~900 LSB).
  writeReg(ADDR_QMC5883L, 0x09, 0x1D);
  return true;
}

bool Magnetometer::initHMC5883L_() {
  // Config A (0x00): 8 amostras média, 15 Hz, medição normal = 0x70.
  writeReg(ADDR_HMC5883L, 0x00, 0x70);
  // Config B (0x01): ganho ±1.3 G (1090 LSB/G) = 0x20, melhor resolução p/ a Terra.
  writeReg(ADDR_HMC5883L, 0x01, 0x20);
  // Mode (0x02): medição contínua = 0x00.
  writeReg(ADDR_HMC5883L, 0x02, 0x00);
  return true;
}

bool Magnetometer::readRawL_(MagField& out) {
  // QMC5883L: 6 bytes a partir de 0x00, ordem X,Y,Z, cada eixo little-endian.
  Wire.beginTransmission(ADDR_QMC5883L);
  Wire.write(0x00);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)ADDR_QMC5883L, 6) != 6) return false;
  int16_t x = Wire.read() | (Wire.read() << 8);
  int16_t y = Wire.read() | (Wire.read() << 8);
  int16_t z = Wire.read() | (Wire.read() << 8);
  out = {x * QMCL_LSB_TO_UT, y * QMCL_LSB_TO_UT, z * QMCL_LSB_TO_UT};
  return true;
}

bool Magnetometer::readRawHMC_(MagField& out) {
  // HMC5883L: 6 bytes a partir de 0x03, ordem X,Z,Y, cada eixo big-endian.
  Wire.beginTransmission(ADDR_HMC5883L);
  Wire.write(0x03);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)ADDR_HMC5883L, 6) != 6) return false;
  int16_t x = (Wire.read() << 8) | Wire.read();
  int16_t z = (Wire.read() << 8) | Wire.read();
  int16_t y = (Wire.read() << 8) | Wire.read();
  out = {x * HMC_LSB_TO_UT, y * HMC_LSB_TO_UT, z * HMC_LSB_TO_UT};
  return true;
}

bool Magnetometer::tryReacquire() {
  if (!mock_) return false;  // já está num sensor real
  if (!tryAcquire_()) return false;
  mock_ = false;
  Serial.printf("Magnetometer: sensor RECONECTADO (%s)\n", chipName());
  return true;
}

MagField Magnetometer::readRaw_() {
  if (mock_) {
    // Gerador sintético: vetor horizontal girando devagar + componente vertical
    // pequena, emulando o campo de Sobral perto do equador magnético
    // (|B|~31 µT, inclinação ~ -11°, baixa, sustenta a fala mesmo no fallback).
    const float theta = millis() / 2000.0f;  // ~3 s por volta
    const float bh = 30.0f;
    return {bh * cosf(theta), bh * sinf(theta), -6.0f};
  }

  MagField f;
  bool ok = false;
  switch (chip_) {
    case CHIP_QMC5883P: {
      float gx = 0, gy = 0, gz = 0;
      ok = qmcP_.getGaussField(&gx, &gy, &gz);
      if (ok) f = {gx * GAUSS_TO_UT, gy * GAUSS_TO_UT, gz * GAUSS_TO_UT};
      break;
    }
    case CHIP_QMC5883L: ok = readRawL_(f); break;
    case CHIP_HMC5883L: ok = readRawHMC_(f); break;
    default: ok = false; break;
  }
  if (!ok) return lastCalibrated_;  // leitura falhou: repete a última (evita pisca)
  return f;
}

MagField Magnetometer::read() {
  const MagField raw = readRaw_();

  if (calibrating_) {
    calMin_.bx = fminf(calMin_.bx, raw.bx);
    calMin_.by = fminf(calMin_.by, raw.by);
    calMin_.bz = fminf(calMin_.bz, raw.bz);
    calMax_.bx = fmaxf(calMax_.bx, raw.bx);
    calMax_.by = fmaxf(calMax_.by, raw.by);
    calMax_.bz = fmaxf(calMax_.bz, raw.bz);
  }

  lastCalibrated_ = {raw.bx - offset_.bx, raw.by - offset_.by, raw.bz - offset_.bz};

  if (!tared_) return lastCalibrated_;
  return {lastCalibrated_.bx - tareOffset_.bx,
          lastCalibrated_.by - tareOffset_.by,
          lastCalibrated_.bz - tareOffset_.bz};
}

void Magnetometer::startCalibration() {
  calibrating_ = true;
  calMin_ = {INFINITY, INFINITY, INFINITY};
  calMax_ = {-INFINITY, -INFINITY, -INFINITY};
}

void Magnetometer::finishCalibration() {
  if (!calibrating_) return;
  calibrating_ = false;
  // Sem amostras coletadas (nenhum read durante a janela): não toca no offset.
  if (!isfinite(calMin_.bx) || !isfinite(calMax_.bx)) return;
  offset_ = FieldMath::hardIronOffset(calMin_, calMax_);
  calibrated_ = true;
  saveCalibration_();
}

void Magnetometer::toggleTare() {
  if (!tared_) {
    tareOffset_ = lastCalibrated_;  // congela o campo atual como novo zero
    tared_ = true;
  } else {
    tareOffset_ = {0.0f, 0.0f, 0.0f};
    tared_ = false;
  }
}

void Magnetometer::loadCalibration_() {
  Preferences prefs;
  prefs.begin(NVS_NS, /*readOnly=*/true);
  calibrated_ = prefs.getBool("cal", false);
  offset_.bx = prefs.getFloat("ox", 0.0f);
  offset_.by = prefs.getFloat("oy", 0.0f);
  offset_.bz = prefs.getFloat("oz", 0.0f);
  prefs.end();
}

void Magnetometer::saveCalibration_() {
  Preferences prefs;
  prefs.begin(NVS_NS, /*readOnly=*/false);
  prefs.putBool("cal", calibrated_);
  prefs.putFloat("ox", offset_.bx);
  prefs.putFloat("oy", offset_.by);
  prefs.putFloat("oz", offset_.bz);
  prefs.end();
}
