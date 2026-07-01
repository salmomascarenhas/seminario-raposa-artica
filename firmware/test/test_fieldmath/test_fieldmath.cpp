#include <unity.h>

#include "FieldMath.h"

void setUp(void) {}
void tearDown(void) {}

// Ciclo 1 (tracer bullet): magnitude de um vetor conhecido.
// {30, 40, 0} µT -> sqrt(900 + 1600) = 50.
void test_magnitude_of_known_vector(void) {
  MagField f = {30.0f, 40.0f, 0.0f};
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 50.0f, FieldMath::magnitude(f));
}

// Ciclo 2: inclinação de campo vertical (só componente bz) -> 90° (caso polo).
void test_inclination_vertical_field_is_90(void) {
  MagField f = {0.0f, 0.0f, 45.0f};
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 90.0f, FieldMath::inclination(f));
}

// Ciclo 3: campo puramente horizontal -> 0° (caso Sobral, perto do equador magnético).
void test_inclination_horizontal_field_is_0(void) {
  MagField f = {25.0f, 10.0f, 0.0f};
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0f, FieldMath::inclination(f));
}

// Ciclo 4: heading no eixo +by (bx=0, by>0) -> 90°.
void test_heading_positive_y_is_90(void) {
  MagField f = {0.0f, 20.0f, -5.0f};
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 90.0f, FieldMath::heading(f));
}

// Ciclo 5: offset hard-iron é o centro da nuvem (min+max)/2 por eixo.
// Campo de viés deslocado: min={-10,-30,5}, max={50,10,45} -> offset={20,-10,25}.
void test_hard_iron_offset_is_midpoint(void) {
  MagField min = {-10.0f, -30.0f, 5.0f};
  MagField max = {50.0f, 10.0f, 45.0f};
  MagField off = FieldMath::hardIronOffset(min, max);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 20.0f, off.bx);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, -10.0f, off.by);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 25.0f, off.bz);
}

// Ciclo 6: nuvem simétrica em torno da origem -> offset zero (sem ferro permanente).
void test_hard_iron_offset_symmetric_is_zero(void) {
  MagField min = {-40.0f, -40.0f, -40.0f};
  MagField max = {40.0f, 40.0f, 40.0f};
  MagField off = FieldMath::hardIronOffset(min, max);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0f, off.bx);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0f, off.by);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 0.0f, off.bz);
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_magnitude_of_known_vector);
  RUN_TEST(test_inclination_vertical_field_is_90);
  RUN_TEST(test_inclination_horizontal_field_is_0);
  RUN_TEST(test_heading_positive_y_is_90);
  RUN_TEST(test_hard_iron_offset_is_midpoint);
  RUN_TEST(test_hard_iron_offset_symmetric_is_zero);
  return UNITY_END();
}
