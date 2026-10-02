export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      const payload = await request.json();
      
      // Jika update berasal dari pesan (message)
      if (payload.message) {
        const chatId = payload.message.chat.id;
        const text = payload.message.text || "";

        if (text.startsWith("/start")) {
          await sendMessage(env.BOT_TOKEN, chatId, "Selamat datang di ZE VPN Config Generator.\nKirimkan link VLESS/VMess/Trojan Anda untuk diubah menjadi format OpenClash dengan Preset Halo Flexy.");
          return new Response("OK");
        }

        // Kalau text mengandung format vless://
        if (text.startsWith("vless://") || text.startsWith("vmess://") || text.startsWith("trojan://")) {
          try {
            const parsed = parseProxyLink(text);
            const bugHost = `support.zoom.us.${parsed.host}`;
            const yaml = generateYaml(parsed.type, parsed.host, parsed.port, parsed.uuid, bugHost, parsed.path || '/');
            
            await sendDocument(env.BOT_TOKEN, chatId, yaml, "config_halo_flexy.yaml");
            return new Response("OK");
          } catch (e) {
            await sendMessage(env.BOT_TOKEN, chatId, "Gagal memproses link. Pastikan format valid.");
            return new Response("Error processing link");
          }
        }
        
        await sendMessage(env.BOT_TOKEN, chatId, "Kirimkan link VLESS/VMess/Trojan yang valid.");
      }
      return new Response("OK");
    }
    return new Response("ZE VPN Bot Running");
  }
};

async function sendMessage(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}

async function sendDocument(token, chatId, contentStr, filename) {
  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  
  // Menggunakan FormData untuk mengirim file buffer
  const formData = new FormData();
  formData.append("chat_id", chatId);
  
  // Membuat Blob dari string YAML
  const blob = new Blob([contentStr], { type: "text/yaml" });
  formData.append("document", blob, filename);

  await fetch(url, {
    method: "POST",
    body: formData
  });
}

function parseProxyLink(link) {
  const type = link.split("://")[0];
  const urlObj = new URL(link);
  
  let host = urlObj.hostname;
  let port = urlObj.port || 443;
  let uuid = urlObj.username;
  let path = urlObj.searchParams.get("path") || "/";
  
  // Khusus vmess yang formatnya base64
  if (type === "vmess") {
    const decoded = JSON.parse(atob(link.replace("vmess://", "")));
    host = decoded.add;
    port = decoded.port;
    uuid = decoded.id;
    path = decoded.path || "/";
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
