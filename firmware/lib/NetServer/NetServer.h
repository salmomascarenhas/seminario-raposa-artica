#pragma once

#include <ESPAsyncWebServer.h>

#include <functional>
#include <string>

// Camada de transporte: cria o Access Point Wi-Fi e serve um WebSocket em /ws.
// Não conhece física nem sensor, só empurra bytes e entrega comandos recebidos.
class NetServer {
 public:
  NetServer() : server_(80), ws_("/ws") {}

  // Sobe o AP (SSID/senha) e o servidor WebSocket.
  void begin(const char* ssid, const char* password);

  // Envia uma mensagem de telemetria para todos os clientes conectados.
  void broadcast(const std::string& json);

  // Registra o callback de comandos (texto recebido de um cliente). Slices 3/4.
  void onCommand(std::function<void(const std::string&)> cb) { onCommand_ = cb; }

  // Manutenção periódica das conexões, chamar no loop().
  void loop();

 private:
  AsyncWebServer server_;
  AsyncWebSocket ws_;
  std::function<void(const std::string&)> onCommand_;
};
