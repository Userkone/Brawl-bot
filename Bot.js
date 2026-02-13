// Bot Discord Brawl Stars - Simple communautaire en français
// ✅ VERSION CORRIGÉE

const {
Client,
GatewayIntentBits,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle,
EmbedBuilder,
Events,
REST,
Routes,
SlashCommandBuilder
} = require(‘discord.js’);
const fs = require(‘fs’);

// ─── ⚡ CONFIGURATION ──────────────────────────────────────────────────────────
// 🔴 IMPORTANT : mets ton token ici (ne le partage JAMAIS publiquement !)
const TOKEN    = process.env.DISCORD_TOKEN || “MTQ3MTkyODc1MjkwODAxMzU2OA.G7X2KC.82-AqOSQfiiDsLkXEZu041wc3HuqGwXfu61VKw”;
// 🔴 Remplace par l’ID de ton application (onglet “General Information” du Dev Portal)
const CLIENT_ID = process.env.CLIENT_ID || “1471928752908013568”;
// ─────────────────────────────────────────────────────────────────────────────

// Points des joueurs (stockés dans points.json)
const pointsFile = ‘./points.json’;
let points = {};
if (fs.existsSync(pointsFile)) {
points = JSON.parse(fs.readFileSync(pointsFile, ‘utf8’));
}

function savePoints() {
fs.writeFileSync(pointsFile, JSON.stringify(points, null, 2));
}

// File d’attente
let queue = [];

// ─── CLIENT DISCORD ───────────────────────────────────────────────────────────
const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
GatewayIntentBits.GuildVoiceStates
]
});

// ─── ENREGISTREMENT DES COMMANDES SLASH ──────────────────────────────────────
// ✅ FIX #1 : Les commandes slash doivent être enregistrées via l’API REST
//             avant d’être utilisables. Sans ça, /jouer n’apparaît pas dans Discord.
async function registerCommands() {
const commands = [
new SlashCommandBuilder()
.setName(‘jouer’)
.setDescription(“Rejoindre la file d’attente Ranked 3v3”)
.toJSON(),

```
    new SlashCommandBuilder()
        .setName('points')
        .setDescription("Voir ton score ou celui d'un joueur")
        .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commandes slash enregistrées.');
} catch (err) {
    console.error('❌ Erreur enregistrement commandes :', err);
}
```

}

// ─── ÉVÉNEMENT : BOT PRÊT ────────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
console.log(`✅ ${client.user.tag} est connecté !`);
await registerCommands();
});

// ─── ÉVÉNEMENT : INTERACTIONS (commandes + boutons) ──────────────────────────
// ✅ FIX #2 : Un seul gestionnaire pour TOUTES les interactions
//             (deux client.on séparés causent des conflits)
client.on(Events.InteractionCreate, async interaction => {

```
// ── Commande /jouer ───────────────────────────────────────────────────────
if (interaction.isChatInputCommand() && interaction.commandName === 'jouer') {
    const embed = buildQueueEmbed();
    const row   = buildJoinRow();
    await interaction.reply({ embeds: [embed], components: [row] });
    return;
}

// ── Commande /points ──────────────────────────────────────────────────────
if (interaction.isChatInputCommand() && interaction.commandName === 'points') {
    const user = interaction.user;
    const pts  = points[user.id] ?? 1000;
    await interaction.reply({
        content: `⭐ **${user.username}** — ${pts} points`,
        ephemeral: true
    });
    return;
}

// ── Boutons ───────────────────────────────────────────────────────────────
if (!interaction.isButton()) return;

const user = interaction.user;

if (interaction.customId === 'join') {
    if (!queue.find(u => u.id === user.id)) {
        queue.push({ id: user.id, username: user.username });
    }
}

if (interaction.customId === 'leave') {
    queue = queue.filter(u => u.id !== user.id);
}

// ✅ FIX #3 : Mise à jour du message AVANT followUp
//             (interaction.update() doit être appelé avant interaction.followUp())
if (queue.length < 6) {
    await interaction.update({ embeds: [buildQueueEmbed()] });
    return;
}

// 6 joueurs atteints → lancement du match
// ✅ FIX #4 : On update d'abord, puis followUp
await interaction.update({
    embeds: [buildQueueEmbed()],
    components: [] // désactiver les boutons
});

// Tirage au sort des équipes
// ✅ FIX #5 : .sort(() => Math.random() - 0.5) n'est pas fiable pour mélanger
//             On utilise l'algorithme Fisher-Yates à la place
const shuffled = fisherYates([...queue]);
const teamA    = shuffled.slice(0, 3);
const teamB    = shuffled.slice(3, 6);

queue = []; // reset la file

const matchEmbed = new EmbedBuilder()
    .setTitle("🔥 Match prêt !")
    .setDescription(
        `🔵 **Équipe Bleue**\n${teamA.map(u => `• ${u.username}`).join('\n')}` +
        `\n\n` +
        `🔴 **Équipe Rouge**\n${teamB.map(u => `• ${u.username}`).join('\n')}` +
        `\n\n` +
        `📨 Le capitaine de l'Équipe Bleue crée la room et envoie le lien ici.`
    )
    .setColor(0x00C5FF);

// Boutons pour valider le résultat
const resultRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId('win_blue')
        .setLabel('🔵 Bleue gagne')
        .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
        .setCustomId('win_red')
        .setLabel('🔴 Rouge gagne')
        .setStyle(ButtonStyle.Danger)
);

// Stocker temporairement les équipes pour la validation
client._currentMatch = { teamA, teamB };

await interaction.followUp({ embeds: [matchEmbed], components: [resultRow] });
```

});

// ─── RÉSULTAT DU MATCH ────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
if (!interaction.isButton()) return;
if (![‘win_blue’, ‘win_red’].includes(interaction.customId)) return;

```
const match = client._currentMatch;
if (!match) {
    await interaction.reply({ content: "❌ Aucun match actif.", ephemeral: true });
    return;
}

const winners = interaction.customId === 'win_blue' ? match.teamA : match.teamB;
const losers  = interaction.customId === 'win_blue' ? match.teamB : match.teamA;

for (const u of winners) {
    points[u.id] = (points[u.id] ?? 1000) + 25;
}
for (const u of losers) {
    points[u.id] = Math.max(0, (points[u.id] ?? 1000) - 25);
}

savePoints();
client._currentMatch = null;

const resultLines = [
    `🏆 **${interaction.customId === 'win_blue' ? '🔵 Bleue' : '🔴 Rouge'} gagne !**\n`,
    `✅ Gagnants (+25 pts) : ${winners.map(u => u.username).join(', ')}`,
    `❌ Perdants (-25 pts) : ${losers.map(u => u.username).join(', ')}`
].join('\n');

await interaction.update({ content: resultLines, embeds: [], components: [] });
```

});

// ─── FONCTIONS UTILITAIRES ────────────────────────────────────────────────────

function buildQueueEmbed() {
return new EmbedBuilder()
.setTitle(“🎮 File d’attente Ranked 3v3”)
.setDescription(
`Joueurs : **${queue.length}/6**\n\n` +
(queue.map(u => `• ${u.username}`).join(’\n’) || “*Aucun joueur pour l’instant*”)
)
.setColor(0xFFD700);
}

function buildJoinRow() {
return new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId(‘join’)
.setLabel(‘⚔️ Rejoindre la partie’)
.setStyle(ButtonStyle.Success),
new ButtonBuilder()
.setCustomId(‘leave’)
.setLabel(‘🚪 Quitter la partie’)
.setStyle(ButtonStyle.Danger)
);
}

// Algorithme Fisher-Yates : mélange vraiment aléatoire
function fisherYates(array) {
for (let i = array.length - 1; i > 0; i–) {
const j = Math.floor(Math.random() * (i + 1));
[array[i], array[j]] = [array[j], array[i]];
}
return array;
}

// ─── CONNEXION ────────────────────────────────────────────────────────────────
client.login(TOKEN);
