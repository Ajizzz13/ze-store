export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      const payload = await request.json();
      
      // 1. Handle Tombol Ditekan (Callback Query)
      if (payload.callback_query) {
        const query = payload.callback_query;
        const chatId = query.message.chat.id;
        const preset = query.data;
        const messageId = query.message.message_id;
        
        // Ambil link dari pesan asli yang di-reply oleh tombol ini
        const originalLink = query.message.reply_to_message ? query.message.reply_to_message.text : null;
        
        if (!originalLink) {
          await answerCallbackQuery(env.BOT_TOKEN, query.id, "Link asli tidak ditemukan. Kirim ulang link-nya.");
          return new Response("OK");
        }

        try {
          const parsed = parseProxyLink(originalLink);
          let bugHost = parsed.host; // Default (Normal)
          let filename = "config_normal.yaml";

          if (preset === "preset_haloflexy") {
            bugHost = `support.zoom.us.${parsed.host}`;
            filename = "config_haloflexy.yaml";
          } else if (preset === "preset_axis") {
            bugHost = `v.whatsapp.net.${parsed.host}`;
            filename = "config_axis.yaml";
          }
          
          const yaml = generateYaml(parsed.type, parsed.host, parsed.port, parsed.uuid, bugHost, parsed.path);
          
          // Jawab loading ke user
          await answerCallbackQuery(env.BOT_TOKEN, query.id, "Config sedang dikirim...");
          
          // Kirim file YAML
          await sendDocument(env.BOT_TOKEN, chatId, yaml, filename);
          
          // Edit pesan tombol biar gak dipencet berkali-kali
          await editMessageText(env.BOT_TOKEN, chatId, messageId, `✅ Config ${filename} berhasil dibuat!`);
          
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

        // Kalau pesan diawali link proxy
        if (text.startsWith("vless://") || text.startsWith("vmess://") || text.startsWith("trojan://")) {
          // Tampilkan tombol Preset
          const keyboard = {
            inline_keyboard: [
              [{ text: "Halo Flexy (Zoom)", callback_data: "preset_haloflexy" }],
              [{ text: "Axis (WhatsApp)", callback_data: "preset_axis" }],
              [{ text: "Normal (Tanpa Bug)", callback_data: "preset_normal" }]
            ]
          };
          
          // Penting: Harus me-reply pesan asli user biar link-nya bisa diambil nanti
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
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: queryId, text: text, show_alert: false })
  });
}

async function editMessageText(token, chatId, messageId, text) {
  const url = `https://api.telegram.org/bot${token}/editMessageText`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text })
  });
}

async function sendMessage(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}

async function sendMessageWithKeyboard(token, chatId, text, keyboard, replyToMessageId) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      chat_id: chatId, 
      text: text, 
      reply_markup: keyboard,
      reply_to_message_id: replyToMessageId
    })
  });
}

async function sendDocument(token, chatId, contentStr, filename) {
  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  const formData = new FormData();
  formData.append("chat_id", chatId);
  const blob = new Blob([contentStr], { type: "text/yaml" });
  formData.append("document", blob, filename);

  await fetch(url, { method: "POST", body: formData });
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
    } catch(e) {
      throw new Error("Invalid VMess base64");
    }
  } else {
    // Trick parser: ubah vless/trojan ke http sementara biar bisa di-parse URL API bawaan JS
    const urlObj = new URL(link.replace(/^(vless|trojan):\/\//, "http://"));
    host = urlObj.hostname;
    port = urlObj.port || 443;
    uuid = urlObj.username;
    path = urlObj.searchParams.get("path") || "/";
  }

  return { type, host, port, uuid, path };
}

function generateYaml(type, host, port, uuid, sni, path) {
  return `port: 7890
proxies:
  - name: "ZE-VPN-CONFIG"
    type: ${type}
    server: ${host}
    port: ${port}
    password: ${uuid}
    uuid: ${uuid}
    sni: ${sni}
    network: ws
    ws-opts:
      path: ${path}
      headers:
        Host: ${sni}
proxy-groups:
  - name: "Proxy"
    type: select
    proxies: ["ZE-VPN-CONFIG"]
rules:
  - MATCH,Proxy`;
}
