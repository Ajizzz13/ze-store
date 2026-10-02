import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN);

// Simple in-memory state for demo; use KV in production
const userState = new Map();

bot.start((ctx) => {
    ctx.reply('Pilih Protokol:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'VLESS', callback_data: 'proto_vless' }, { text: 'VMess', callback_data: 'proto_vmess' }],
                [{ text: 'Trojan', callback_data: 'proto_trojan' }]
            ]
        }
    });
});

bot.action(/proto_(.*)/, (ctx) => {
    const proto = ctx.match[1];
    userState.set(ctx.from.id, { proto });
    ctx.reply(`Protokol ${proto.toUpperCase()} terpilih. Kirim link proxy Anda:`);
});

bot.on('text', async (ctx) => {
    const state = userState.get(ctx.from.id);
    if (!state) return ctx.reply('Ketik /start untuk mulai.');

    const link = ctx.message.text;
    try {
        // Simple Parser (Simplified for demonstration)
        // In reality, use a robust parser like 'v2ray-parser'
        const parsed = parseProxyLink(link);
        
        // Preset Bug: Halo Flexy
        const bugHost = `support.zoom.us.${parsed.host}`;
        const yaml = generateYaml(state.proto, parsed.host, parsed.port, parsed.uuid, bugHost, parsed.path || '/');

        await ctx.replyWithDocument({ source: Buffer.from(yaml), filename: 'config.yaml' });
    } catch (e) {
        ctx.reply('Link tidak valid atau protokol tidak didukung.');
    }
});

function parseProxyLink(link) {
    // Basic parser logic for demo
    const url = new URL(link);
    return {
        host: url.hostname,
        port: url.port || 443,
        uuid: url.username,
        path: url.searchParams.get('path') || '/'
    };
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

export default {
    fetch: bot.webhookCallback('/webhook')
};
