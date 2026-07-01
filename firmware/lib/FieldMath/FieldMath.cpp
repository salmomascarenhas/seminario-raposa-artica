#include "FieldMath.h"

#include <cmath>

namespace FieldMath {

float magnitude(const MagField& f) {
  return std::sqrt(f.bx * f.bx + f.by * f.by + f.bz * f.bz);
}

float inclination(const MagField& f) {
  const float bh = std::sqrt(f.bx * f.bx + f.by * f.by);
  return std::atan2(f.bz, bh) * 180.0f / static_cast<float>(M_PI);
}

float heading(const MagField& f) {
  float deg = std::atan2(f.by, f.bx) * 180.0f / static_cast<float>(M_PI);
  if (deg < 0.0f) deg += 360.0f;
  return deg;
}

MagField hardIronOffset(const MagField& min, const MagField& max) {
  return {
      (min.bx + max.bx) * 0.5f,
      (min.by + max.by) * 0.5f,
      (min.bz + max.bz) * 0.5f,
  };
}

}  // namespace FieldMath
