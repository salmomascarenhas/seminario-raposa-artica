#include "NetServer.h"

#include <WiFi.h>

void NetServer::begin(const char* ssid, const char* password) {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ssid, password);

  ws_.onEvent([this](AsyncWebSocket*, AsyncWebSocketClient*, AwsEventType type,
                     void* arg, uint8_t* data, size_t len) {
    if (type != WS_EVT_DATA) return;
    AwsFrameInfo* info = static_cast<AwsFrameInfo*>(arg);
    // Só trata frames de texto completos num único pacote (comandos são curtos).
    if (info->final && info->index == 0 && info->len == len &&
        info->opcode == WS_TEXT && onCommand_) {
      onCommand_(std::string(reinterpret_cast<char*>(data), len));
    }
  });

  server_.addHandler(&ws_);
  server_.begin();
}

void NetServer::broadcast(const std::string& json) {
  ws_.textAll(json.c_str(), json.length());
}

void NetServer::loop() {
  // Libera recursos de clientes que desconectaram.
  ws_.cleanupClients();
}
