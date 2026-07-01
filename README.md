# Magnetorrecepção na Raposa Ártica

Demonstração de eletromagnetismo aplicado: um ESP32 com magnetômetro lê o campo
magnético da sala em tempo real e transmite para uma página web, que desenha o vetor
do campo em 3D e mostra a inclinação, a intensidade e o rumo. O projeto nasceu como a
parte prática de um seminário de Eletromagnetismo Aplicado (UFC, Campus Sobral).

A ideia central: o mesmo campo que se supõe guiar uma raposa na caça é o campo que um
sensor de celular lê para dar o norte. Aqui a gente fabrica esse sensor e mede o campo
ao vivo.

![Demo ao vivo: vetor do campo em 3D com inclinação, intensidade e rumo](assets/demo.png)

## O que ele faz

- Lê o vetor do campo magnético (três eixos) com um magnetômetro AMR.
- Aplica calibração hard-iron (movimento em figura de oito) e salva na memória do ESP32.
- Calcula inclinação, intensidade e rumo a partir do vetor.
- Transmite a telemetria por WebSocket a 10 Hz.
- A página web desenha o vetor em 3D (Three.js) e mostra as grandezas em tempo real.
- Se o hardware não estiver presente, a página cai para um modo simulado sozinha.

Em Sobral, sobre o equador magnético, a inclinação medida fica baixa (campo quase
deitado), o que confirma na prática a previsão do modelo de dipolo.

## Como funciona

```
QMC5883P / QMC5883L / HMC5883L  (sensor AMR, I2C)
        |
     ESP32  (calibração hard-iron + tare, cálculo das grandezas)
        |  WebSocket 10 Hz  (AP Wi-Fi próprio)
        v
   Página web  (Three.js: vetor 3D + leitura numérica)
```

O firmware detecta automaticamente qual chip está conectado (QMC5883P em 0x2C,
QMC5883L em 0x0D ou HMC5883L em 0x1E), então funciona com módulos diferentes sem
recompilar.

![Módulo do sensor, vista explodida](assets/sensor.png)

## Hardware

- ESP32 DevKit (DOIT).
- Módulo magnetômetro AMR: GY-271 (HMC5883L ou QMC5883L) ou QMC5883P.
- Ligação I2C: SDA no GPIO21, SCL no GPIO22, alimentação em 3V3 e GND.

## Como rodar

### Firmware (PlatformIO)

```bash
cd firmware
pio run -e esp32doit-devkit-v1 -t upload
```

Ao ligar, o ESP32 cria um ponto de acesso Wi-Fi próprio e passa a transmitir a
telemetria em `ws://192.168.4.1/ws`.

### Demo web

```bash
cd web
python3 -m http.server 8000
```

Conecte o computador na rede Wi-Fi criada pelo ESP32 e abra `http://localhost:8000`.
O selo deve mudar para "AO VIVO". Sem o hardware, a página abre em modo simulado e
mostra um campo sintético do tipo Sobral.

Na página há três botões: calibrar (abre a janela de figura de oito), zerar (tare, para
o vetor voltar à origem) e congelar (trava a leitura na tela).

## Estrutura do repositório

- `firmware/` codigo do ESP32 (PlatformIO), com biblioteca de magnetômetro
  multi-chip, calibração, cálculo de grandezas e servidor WebSocket.
- `web/` a demo em JavaScript puro (Three.js), fonte única de telemetria com fallback
  para simulado, e testes.
- `archive/` material legado (primeira versão do deck de slides), mantido como registro.

## Contexto acadêmico

Parte prática de um seminário de Eletromagnetismo Aplicado (UFC, Campus Sobral).
Autor: Salmo da Cruz Mascarenhas.

## Licença

Veja o arquivo [LICENSE](LICENSE). As imagens de terceiros usadas no material de slides
têm seus créditos em `archive/slides/assets/img/CREDITOS.md`.
