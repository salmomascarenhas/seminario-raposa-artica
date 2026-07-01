#pragma once

// Vetor do campo magnético em µT, no referencial do sensor.
struct MagField {
  float bx;
  float by;
  float bz;
};

// Grandezas derivadas do vetor B, funções puras, sem estado nem hardware.
namespace FieldMath {

// Módulo do vetor: |B| = sqrt(bx² + by² + bz²), em µT.
float magnitude(const MagField& f);

// Inclinação magnética I, em graus: ângulo entre B e o plano horizontal.
// tan(I) = Bv/Bh, com Bv = bz e Bh = sqrt(bx² + by²).
// Campo horizontal -> 0; campo vertical (para baixo) -> 90.
float inclination(const MagField& f);

// Heading (azimute) do campo no plano horizontal, em graus, normalizado [0, 360).
// atan2(by, bx). Relativo à orientação do sensor, NÃO é a declinação magnética.
float heading(const MagField& f);

// Offset hard-iron a partir dos extremos coletados num gesto figura-8: o centro
// da nuvem de pontos por eixo, (min+max)/2. Subtrair esse offset de cada leitura
// remove o viés do ferro permanente próximo ao sensor. Função pura.
MagField hardIronOffset(const MagField& min, const MagField& max);

}  // namespace FieldMath
