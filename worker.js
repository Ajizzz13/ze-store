export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      const payload = await request.json();
      
      // 1. Handle Tombol Ditekan
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
          await answerCallbackQuery(env.BOT_TOKEN, query.id, "Memproses config via sub.bonds.id...");
          
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
          
          // Buat link baru dengan bug yang sudah disuntik
          const newLink = buildProxyLink(parsed.type, bugHost, parsed.port, parsed.uuid, parsed.path);
          
          // Fetch dari sub.bonds.id
          const subUrl = `https://sub.bonds.id/sub?target=clash&url=${encodeURIComponent(newLink)}&insert=false`;
          const subResp = await fetch(subUrl);
          
          if (!subResp.ok) throw new Error("Gagal fetch dari sub.bonds.id");
          const yaml = await subResp.text();
          
          // Kirim file YAML
          await sendDocument(env.BOT_TOKEN, chatId, yaml, filename);
          await editMessageText(env.BOT_TOKEN, chatId, messageId, `✅ Config ${filename} berhasil di-generate pakai format sub.bonds.id!`);
          
        } catch (e) {
          await answerCallbackQuery(env.BOT_TOKEN, query.id, "Gagal generate dari sub.bonds.id.");
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
          
          await sendMessageWithKeyboard(env.BOT_TOKEN, chatId, "Pilih Preset Bug (Config akan digenerate via sub.bonds.id):", keyboard, messageId);
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
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: queryId, text: text, show_alert: false }) });
}

async function editMessageText(token, chatId, messageId, text) {
  const url = `https://api.telegram.org/bot${token}/editMessageText`;
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text }) });
}

async function sendMessage(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: text }) });
}

async function sendMessageWithKeyboard(token, chatId, text, keyboard, replyToMessageId) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: text, reply_markup: keyboard, reply_to_message_id: replyToMessageId }) });
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
    const urlObj = new URL(link.replace(/^(vless|trojan):\/\//, "http://"));
    host = urlObj.hostname;
    port = urlObj.port || 443;
    uuid = urlObj.username;
    path = urlObj.searchParams.get("path") || "/";
  }

  return { type, host, port, uuid, path };
}

function buildProxyLink(type, bugHost, port, uuid, path) {
  // Bikin link baru dengan bug ter-inject, wajib TLS
  if (type === "vmess") {
    const vmessObj = {
      v: "2", ps: "ZE-VPN", add: bugHost, port: port, id: uuid,
      aid: "0", net: "ws", type: "none", host: bugHost,
      path: path, tls: "tls", sni: bugHost
    };
    // Helper untuk worker (tanpa btoa bawaan)
    const encoded = btoa(JSON.stringify(vmessObj));
    return `vmess://${encoded}`;
  } else {
    // VLESS / Trojan
    return `${type}://${uuid}@${bugHost}:${port}?type=ws&security=tls&path=${encodeURIComponent(path)}&sni=${bugHost}&host=${bugHost}#ZE-VPN`;
  }
}
