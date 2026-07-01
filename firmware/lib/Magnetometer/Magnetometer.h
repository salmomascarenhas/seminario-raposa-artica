#pragma once

#include <Adafruit_QMC5883P.h>
#include <stdint.h>

#include "FieldMath.h"

// Fonte do vetor B. Esconde o magnetômetro (qual chip), a calibração hard-iron
// (persistida na NVS) e o tare atrás de uma interface simples: begin() + read().
//
// AUTO-DETECÇÃO de chip por endereço I2C, assim qualquer GY-271 que chegue funciona
// sem recompilar para um chip específico:
//   0x2C = QMC5883P (lib Adafruit)   0x0D = QMC5883L (Wire cru)   0x1E = HMC5883L (Wire cru)
// Se nenhum responde, cai em MODO MOCK (campo sintético tipo-Sobral) e o loop
// re-tenta via tryReacquire(), de modo que a demo/web fica de pé sem hardware.
//
// Pipeline de read(): raw(µT) -> [acumula figura-8 se calibrando]
//   -> subtrai offset hard-iron -> subtrai tare -> MagField devolvido.
class Magnetometer {
 public:
  enum ChipType { CHIP_NONE, CHIP_QMC5883P, CHIP_QMC5883L, CHIP_HMC5883L };

  // Inicializa: detecta o chip, configura e carrega a calibração da NVS.
  // Cai para mock se nenhum sensor responder. Retorna sempre true (sempre há fonte).
  bool begin();

  // Lê o vetor B atual em µT (calibrado e com tare aplicado).
  MagField read();

  // true se os dados vêm do gerador sintético (nenhum sensor detectado).
  bool isMock() const { return mock_; }

  // Nome do chip detectado, para log/telemetria de diagnóstico.
  const char* chipName() const;

  // Se está em mock, tenta readquirir um sensor real (contato voltou / chip
  // diferente plugado). Retorna true só na transição mock->real. Chamar no loop.
  bool tryReacquire();

  // --- Calibração hard-iron (gesto figura-8) ---
  void startCalibration();   // zera extremos e passa a acumular min/max
  void finishCalibration();  // offset = (min+max)/2; persiste na NVS; marca calibrado
  bool isCalibrating() const { return calibrating_; }
  bool isCalibrated() const { return calibrated_; }

  // --- Tare ---
  void toggleTare();  // 1ª chamada zera o campo atual (ímã vira delta); 2ª restaura
  bool isTared() const { return tared_; }

 private:
  MagField readRaw_();   // sensor real (µT) ou mock, sem calibração nem tare
  bool tryAcquire_();    // detecta+configura qualquer chip suportado; true se achou
  bool initQMC5883L_();  // config do QMC5883L @0x0D (Wire cru)
  bool initHMC5883L_();  // config do HMC5883L @0x1E (Wire cru)
  bool readRawL_(MagField& out);    // leitura crua do QMC5883L -> µT
  bool readRawHMC_(MagField& out);  // leitura crua do HMC5883L -> µT
  void loadCalibration_();
  void saveCalibration_();

  Adafruit_QMC5883P qmcP_;          // driver do QMC5883P (0x2C)
  ChipType chip_ = CHIP_NONE;
  bool mock_ = true;

  MagField offset_ = {0.0f, 0.0f, 0.0f};      // viés hard-iron, em µT
  MagField tareOffset_ = {0.0f, 0.0f, 0.0f};  // campo zerado pelo tare, em µT
  MagField lastCalibrated_ = {0.0f, 0.0f, 0.0f};  // último read() pós-offset (p/ tare)

  bool calibrated_ = false;
  bool calibrating_ = false;
  bool tared_ = false;
  MagField calMin_, calMax_;  // extremos acumulados durante a figura-8
};
