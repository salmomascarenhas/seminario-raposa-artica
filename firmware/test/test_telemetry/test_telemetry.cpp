#include <unity.h>

#include <ArduinoJson.h>

#include "Telemetry.h"

void setUp(void) {}
void tearDown(void) {}

static TelemetryState sampleState() {
  TelemetryState s;
  s.t = 12345;
  s.field = {-12.4f, 34.1f, -45.2f};
  s.magnitude = 58.3f;
  s.inclination = -10.4f;
  s.heading = 18.2f;
  s.calibrated = true;
  s.calibrating = false;
  return s;
}

// Ciclo 1 (tracer): o JSON carrega o vetor B (bx, by, bz) com os valores corretos.
void test_json_carries_vector(void) {
  std::string json = Telemetry::toJson(sampleState());

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, json);
  TEST_ASSERT_FALSE(err);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, -12.4f, doc["bx"].as<float>());
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 34.1f, doc["by"].as<float>());
  TEST_ASSERT_FLOAT_WITHIN(0.01f, -45.2f, doc["bz"].as<float>());
}

// Ciclo 2: o JSON carrega o timestamp e as grandezas derivadas.
void test_json_carries_timestamp_and_derived(void) {
  std::string json = Telemetry::toJson(sampleState());

  JsonDocument doc;
  deserializeJson(doc, json);
  TEST_ASSERT_EQUAL_UINT32(12345, doc["t"].as<unsigned long>());
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 58.3f, doc["magnitude"].as<float>());
  TEST_ASSERT_FLOAT_WITHIN(0.01f, -10.4f, doc["inclination"].as<float>());
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 18.2f, doc["heading"].as<float>());
}

// Ciclo 3: o JSON carrega as flags de calibração como booleanos.
void test_json_carries_calibration_flags(void) {
  std::string json = Telemetry::toJson(sampleState());

  JsonDocument doc;
  deserializeJson(doc, json);
  TEST_ASSERT_TRUE(doc["calibrated"].is<bool>());
  TEST_ASSERT_TRUE(doc["calibrated"].as<bool>());
  TEST_ASSERT_TRUE(doc["calibrating"].is<bool>());
  TEST_ASSERT_FALSE(doc["calibrating"].as<bool>());
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_json_carries_vector);
  RUN_TEST(test_json_carries_timestamp_and_derived);
  RUN_TEST(test_json_carries_calibration_flags);
  return UNITY_END();
}
