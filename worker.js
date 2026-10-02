export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      const payload = await request.json();
      
      // 1. Handle Callback Query (Tombol Preset Ditekan)
      if (payload.callback_query) {
        const query = payload.callback_query;
        const chatId = query.message.chat.id;
        const preset = query.data;
        const messageId = query.message.message_id;
        
        const originalLink = query.message.reply_to_message ? query.message.reply_to_message.text : null;
        
        if (!originalLink) {
          await answerCallbackQuery(env.BOT_TOKEN, query.id, "Link asli tidak ditemukan. Kirim ulang link-nya.");
          return new Response("OK");
        }

        try {
          const parsed = parseProxyLink(originalLink);
          let bugHost = parsed.host; // Default
          let filename = "ze_config_normal.yaml";

          if (preset === "preset_haloflexy") {
            bugHost = `support.zoom.us.${parsed.host}`;
            filename = "ze_config_haloflexy.yaml";
          } else if (preset === "preset_axis") {
            bugHost = `v.whatsapp.net.${parsed.host}`;
            filename = "ze_config_axis.yaml";
          }
          
          // Generate YAML Native menggunakan Template Rikigareng
          const yaml = generateRikigarengYaml(parsed.type, parsed.host, parsed.port, parsed.uuid, bugHost, parsed.path || '/');
          
          await answerCallbackQuery(env.BOT_TOKEN, query.id, "Config sedang dikirim...");
          await sendDocument(env.BOT_TOKEN, chatId, yaml, filename);
          await editMessageText(env.BOT_TOKEN, chatId, messageId, `✅ Config ${filename} berhasil dibuat! (Format OpenClash Lengkap)`);
          
        } catch (e) {
          await answerCallbackQuery(env.BOT_TOKEN, query.id, "Gagal memproses link.");
        }
        return new Response("OK");
      }
      
      // 2. Handle Pesan Biasa
      if (payload.message) {
        const chatId = payload.message.chat.id;
        const text = payload.message.text || "";
        const messageId = payload.message.message_id;

        if (text.startsWith("/start")) {
          await sendMessage(env.BOT_TOKEN, chatId, "👋 Selamat datang di ZE VPN Config Generator.\n\nKirimkan link VLESS/VMess/Trojan Anda. Nanti akan muncul pilihan preset bug-nya.");
          return new Response("OK");
        }

        if (text.startsWith("vless://") || text.startsWith("vmess://") || text.startsWith("trojan://")) {
          const keyboard = {
            inline_keyboard: [
              [{ text: "Halo Flexy (Zoom)", callback_data: "preset_haloflexy" }],
              [{ text: "Axis (WhatsApp)", callback_data: "preset_axis" }],
              [{ text: "Normal (Tanpa Bug)", callback_data: "preset_normal" }]
            ]
          };
          
          await sendMessageWithKeyboard(env.BOT_TOKEN, chatId, "Pilih Preset Bug untuk config ini:", keyboard, messageId);
          return new Response("OK");
        }
        
        await sendMessage(env.BOT_TOKEN, chatId, "Kirimkan link VLESS/VMess/Trojan yang valid (vless://...).");
      }
      return new Response("OK");
    }
    return new Response("ZE VPN Bot Running");
  }
};

async function answerCallbackQuery(token, queryId, text) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: queryId, text: text, show_alert: false })
  });
}

async function editMessageText(token, chatId, messageId, text) {
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text })
  });
}

async function sendMessage(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}

async function sendMessageWithKeyboard(token, chatId, text, keyboard, replyToMessageId) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text, reply_markup: keyboard, reply_to_message_id: replyToMessageId })
  });
}

async function sendDocument(token, chatId, contentStr, filename) {
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("document", new Blob([contentStr], { type: "text/yaml" }), filename);
  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: formData });
}

function parseProxyLink(link) {
  const type = link.split("://")[0];
  let host, port, uuid, path;

  if (type === "vmess") {
    try {
      const decoded = JSON.parse(atob(link.replace("vmess://", "")));
      host = decoded.add;
      port = decoded.port;
      uuid = decoded.id;
      path = decoded.path || "/";
    } catch(e) { throw new Error("Invalid VMess base64"); }
  } else {
    const urlObj = new URL(link.replace(/^(vless|trojan):\/\//, "http://"));
    host = urlObj.hostname;
    port = urlObj.port || 443;
    uuid = urlObj.username;
    path = urlObj.searchParams.get("path") || "/";
  }
  return { type, host, port, uuid, path };
}

function generateRikigarengYaml(type, host, port, uuid, sni, path) {
  const pName = "ZE-VPN-CONFIG";
  const isTls = "tls: true\n    ";
  
  let proxyStr = "";
  if (type === "trojan") {
    proxyStr = `- name: ${pName}\n    server: ${host}\n    port: ${port}\n    type: trojan\n    password: ${uuid}\n    skip-cert-verify: true\n    sni: ${sni}\n    network: ws\n    ws-opts:\n      path: ${path}\n      headers:\n        Host: ${sni}\n    udp: true`;
  } else if (type === "vmess") {
    proxyStr = `- name: ${pName}\n    server: ${host}\n    port: ${port}\n    type: vmess\n    uuid: ${uuid}\n    alterId: 0\n    cipher: auto\n    ${isTls}skip-cert-verify: true\n    servername: ${sni}\n    network: ws\n    ws-opts:\n      path: ${path}\n      headers:\n        Host: ${sni}\n    udp: true`;
  } else {
    proxyStr = `- name: ${pName}\n    server: ${host}\n    port: ${port}\n    type: vless\n    uuid: ${uuid}\n    ${isTls}skip-cert-verify: true\n    servername: ${sni}\n    network: ws\n    ws-opts:\n      path: ${path}\n      headers:\n        Host: ${sni}\n    udp: true`;
  }

  return `port: 7890
socks-port: 7891
redir-port: 7892
mixed-port: 7893
tproxy-port: 7895
ipv6: false
mode: rule
log-level: silent
allow-lan: true
external-controller: 0.0.0.0:9090
secret: ''
bind-address: '*'
unified-delay: true
profile:
  store-selected: true
dns:
  enable: true
  ipv6: false
  enhanced-mode: redir-host
  listen: 0.0.0.0:7874
  nameserver:
    - 8.8.8.8
    - 1.0.0.1
    - https://dns.google/dns-query
  fallback:
    - 1.1.1.1
    - 8.8.4.4
    - https://cloudflare-dns.com/dns-query
  default-nameserver:
    - 8.8.8.8
    - 1.1.1.1

proxies:
  - ${proxyStr}

proxy-groups:
  - name: Friendly_Teams
    type: select
    proxies:
      - ${pName}
      - BEST-PING
      - DIRECT
  - name: BEST-PING
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    proxies:
      - ${pName}

rules:
  - MATCH,Friendly_Teams`;
}
