# 🏏 Taco Online — Bete-Ombro no navegador

Jogo de **taco** (bete-ombro, bets, tacobol, pau na lata) multiplayer **2 contra 2**, em 3D, que roda no navegador.
Servidor Node.js autoritativo com WebSocket, cliente Three.js, tudo num container Docker pronto para homelab.

- **4 jogadores online** (duas duplas) — vagas vazias viram bots, e quem cair da conexão é substituído por um bot.
- **Todas as regras** do verbete [Bete-ombro da Wikipédia](https://pt.wikipedia.org/wiki/Bete-ombro), com as variações regionais configuráveis na sala.
- **Movimento livre** com teclado + mouse: o lançador corre atrás da bolinha por todo o campo (e pelo mato), os rebatedores correm lado a lado e batem os tacos no meio.
- **Boneco personalizável** com nome e 18 partes, todas com 6+ opções: pele, altura/corpo, cabelo, cor do cabelo, olhos, barba,
  **boné/chapéu (10)**, cor do boné, **óculos de sol (8)**, **brinco (8)**, **relógio (7)**, colar, camiseta, cor da camiseta, calça/bermuda, cor da calça, calçado e skin do taco.
- **13 skins de bolinha** (tênis, meia, futebol, fogo, galáxia, bola de ouro…), algumas compradas na loja.
- **Moedas, loja e poderes**: cada partida rende moedas; compre bolinhas, tacos e chapéus premium e poderes
  (corrida prolongada, mira quase perfeita, dancinha).
- **Times e campeonatos**: crie sua dupla, dispute campeonatos todos-contra-todos; 1º, 2º e 3º lugares ganham moedas. Ranking geral.
- **5 cenários**: campinho, rua de bairro, sítio, estacionamento do mercado e praia (a bola rola diferente em cada chão).
- **Chat de voz por proximidade** (WebRTC): quanto mais longe o boneco, mais baixo.
- **Câmera** em 3ª pessoa atrás do boneco (mouse gira) ou em **1ª pessoa**.

## Rodando no homelab

Imagem publicada pelo CI (amd64 e arm64):

```bash
docker run -d --name taco -p 3000:3000 --restart unless-stopped ghcr.io/jesielpfeifer/taco-online:latest
```

Ou com compose (faz o build local se preferir):

```bash
git clone https://github.com/JesielPfeifer/taco-online.git && cd taco-online
docker compose up -d --build        # porta: TACO_PORT=8080 docker compose up -d
```

Abra `http://IP-DO-SERVIDOR:3000`, crie uma sala e mande o link (`/?sala=CODIGO`) para os amigos. A sala é montada em
três etapas, como a escolha de mapa do Counter-Strike: **mapa** (cartões com prévia), **modo** (partida única ou
campeonato) e **regras e jogadores**. Recarregar a página (F5) no meio da partida devolve o jogador ao mesmo lugar.

**Dados**: moedas, compras, times e campeonatos ficam em `/data/taco.json` (volume `taco-data` no compose).
No `docker run`, adicione `-v taco-data:/data`. Cada navegador guarda uma chave secreta do jogador; limpar os
dados do site perde a carteira daquele navegador.

**Chat de voz**: o navegador só libera o microfone em **HTTPS** (ou `localhost`), então coloque o jogo atrás de um
proxy com certificado. Na rede local basta o STUN padrão; para amigos de fora atrás de NAT restrito, configure um
TURN (por exemplo coturn) com `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL`.

**Proxy reverso**: o jogo usa WebSocket em `/ws`. No Nginx inclua `proxy_set_header Upgrade $http_upgrade;` e
`proxy_set_header Connection "upgrade";`. Caddy e Traefik já fazem isso sozinhos. `GET /health` serve de health check.

## Desenvolvimento

```bash
npm install
npm run dev     # http://localhost:3000, reinicia ao salvar
npm test        # partidas bot × bot headless + testes de regras
```

Requer Node.js 20+. Variável `PORT` muda a porta (padrão 3000).

## Controles

| Quem | Tecla / mouse | Ação |
| --- | --- | --- |
| Todos | `W A S D` / setas | Mover livremente (relativo à câmera) |
| Todos | `Shift` | Correr (gasta fôlego; no mato anda pela metade) |
| Todos | Mouse | Mirar |
| Rebatedor | Clique | Rebater na direção do mouse — o tempo do clique define força e precisão. Só vale se a bola encontrar o **taco**; no corpo é lancha |
| Rebatedor | `Espaço` | Bater os tacos no meio (também acontece sozinho ao se encontrarem lado a lado) |
| Rebatedor | `N` / `L` | Pedir "nada" / pedir licença |
| Lançador | Segurar e soltar clique | Carregar a força (barra sobe e desce) e lançar |
| Lançador | `F` ou botão direito | Queimar a casinha na mão (só se estiver desprotegida) |
| Lançador | `R` / `P` | Pedir "reta" (bete-ombro) / gritar "pátio" |
| Todos | `T` | Pedir tempo |
| Todos | `Esc` / ☰ | Menu da partida: **Opções**, pedir rendição, sair (um bot assume) |
| Todos | `[` / `]` | Diminuir / aumentar a sensibilidade do mouse |
| Todos | Clique no campo + mouse | Prende o mouse: girar a câmera, mira no centro da tela (`Esc` solta) |
| Todos | `Q` / `E`, `X` | Girar a câmera pelo teclado, meia-volta |
| Todos | `C`, `V`, roda do mouse | 1ª/3ª pessoa, câmera geral, zoom |
| Todos | `G` | Dancinha (poder comprado) |
| Todos | `B` | Liga/desliga o microfone |
| Todos | `Enter`, `M`, `H` | Conversar, som, ajuda com as regras |

## Opções e acessibilidade

**⚙️ Opções** abre no menu inicial (antes de jogar), na sala e no jogo (`Esc` → Opções). Tudo fica salvo no navegador e vale na hora.

- **Câmera e mouse**: sensibilidade (1× = igual ao cursor do PC), distância, campo de visão, inverter eixo vertical,
  câmera virando sozinha para o campo.
- **Acessibilidade / enjoo (motion sickness)**: *Reduzir movimento* (sem giros automáticos, viradas instantâneas, sem rastro da
  bola e sem animações de tela; liga sozinho se o sistema pedir "reduzir movimento"), *giro em passos* de 45° no Q/E,
  *suavização* da câmera (0 = presa ao boneco, sem balanço), *vinheta de conforto* ao mover/girar, *ponto fixo* no centro da
  tela, *tamanho do texto/interface* e *cores para daltonismo* (azul × laranja).

## Moedas, loja, times e campeonato

- Vitória dá 50 🪙 e derrota 15 🪙 por jogador humano; todo jogador começa com 100 🪙.
- **Loja** (menu ou sala): bolinhas premium (neon, melancia, fogo, basquete, ouro, galáxia, arco-íris), tacos (rosa choque,
  camuflado, dourado, neon), chapéus (coroa, cartola) e poderes. Itens premium podem ser provados no boneco antes de comprar.
- **Poderes** (o anfitrião pode desligar na sala): *Corrida prolongada* (fôlego dura o dobro), *Mira quase perfeita*
  (lançamento e rebatida quase sem desvio), *Dancinha* (`G`). Cada poder comprado pode ser ligado/desligado na loja.
- **Times**: "Meus times" cria uma dupla com código para o parceiro entrar.
- **Campeonato**: na sala, o anfitrião marca as duplas presentes (2 a 6) e inicia. Todos contra todos, 3 pontos por vitória,
  desempate por saldo. Ao final: 🥇 500, 🥈 300, 🥉 150 moedas para cada jogador da dupla, e o título conta no ranking.

## Regras implementadas

O jogo segue o texto da Wikipédia; o que varia por região vira opção na sala (o anfitrião escolhe).

| Regra | Como funciona no jogo |
| --- | --- |
| Duplas, tacos, casinhas | Duas duplas; cada rebatedor numa base com tripé (casinha) no centro do círculo; lançadores atrás das bases. Distância entre bases configurável (6–12 m). |
| Lançamento | Só vale como lançamento se feito **de trás da linha atrás da base do seu lado** e mirando a casinha oposta — esse arremesso derruba a casinha mesmo com taco no chão. |
| Taco no chão (regra 1) | Rebatedor dentro do círculo com o taco no chão protege a casinha (anel verde). Tirar o taco antes do lançamento deixa a casinha ser derrubada, inclusive pelo lançador do mesmo lado. |
| Troca (regra 2) | Casinha derrubada: o jogo para e as duplas trocam de papel. |
| Corrida e ponto | Depois da rebatida os rebatedores cruzam no meio, batem os tacos e encostam na base oposta. Repete até um lançador voltar para trás de uma base com a bola. Lançador que chega antes pode queimar a casinha. |
| Fim de jogo (regra 3) | Atingir 5, 10, 12, 24 ou 100 pontos (cada cruzada vale 1, 2 ou 10) **e cruzar os tacos**. Encerra no cruzamento, mesmo que a casinha caia depois. |
| Licença (regra 4) | `L`: o rebatedor tira o taco do chão sem risco (e sem poder correr). |
| Vitória / pegar no ar (regras 5 e 6) | Bola rebatida pega antes de quicar: os lançadores ganham o taco, ganham o taco + 2 pontos, ou vitória automática. |
| Pátio / bolinha perdida (regra 7) | Bola por cima da cerca vai para o mato. Os rebatedores marcam até os lançadores gritarem "pátio" (`P`); então ganham 1 ou 2 cruzadas extras, nada, ou a vitória. |
| Quem começa no taco | Molhado ou seco, par ou ímpar, **último palmo** (mãos alternadas no taco + pêndulo de 10 s) ou sorteio. |
| Reta / bete-ombro | Bola rebatida parada entre as casinhas: lançador pede "reta" e arremessa de onde ela parou, com o rebatedor de taco no ombro. O rebatedor pode pedir "nada" antes. |
| Lancha / carne / shot | Bola no corpo do rebatedor: 3 na lancha perde o taco, ou perde 4 pontos (PR), ou pênalti de perto (RS), ou perde na hora. |
| Pra trás | Bola que bate no taco e vai para trás do círculo: "uma pra trás"; três perdem os tacos. Marcar ponto desconta os pra trás. Opção de não ter "trás" na pontuação máxima. |
| Tempo / bete morto | `T` pausa até 100 s ("tempo-para-dois"), opcionalmente custando uma pra trás. Rebatedor parado sem pedir tempo vira bete morto e a casinha dele pode ser derrubada. |
| Regras diversas | Perder o taco na pontuação máxima pode cortar os pontos pela metade. Final paulista opcional: rebatedores de pé sobre os tacos e um arremesso do lançador (acertou: −metade da meta; errou: perdeu). |

## Arquitetura

```
server/index.js   Express (estáticos) + WebSocket /ws
server/lobby.js   Conexões, criação e entrada em salas
server/room.js    Partida autoritativa a 60 Hz: física da bola, regras, eventos, snapshots a 30 Hz
server/store.js   Persistência (JSON atômico em DATA_DIR): carteiras, compras, times, campeonatos
server/bots.js    IA dos bots (lançar, rebater, correr, pedir reta/pátio, minijogos de início)
shared/config.js  Constantes, regras, opções de avatar e skins (usado pelo servidor e pelo navegador)
public/js/        Cliente: Three.js (cenários, boneco low-poly procedural com poses-chave), HUD, loja, voz WebRTC
test/             Testes com partidas bot × bot completas
```

O cliente prevê o próprio movimento e interpola os demais jogadores; colisões, regras e placar são decididos só no servidor.

## Sobre o boneco

O modelo segue o estilo dos kits modulares low-poly de personagem (corpo em peças separadas + acessórios encaixáveis), como o
[OverScore Proxy (CC0)](https://opengameart.org/content/overscore-proxy-modular-low-poly-female-character-creation-set) e o
[LowPoly Glasses Pack (CC0)](https://opengameart.org/content/lowpoly-glasses-pack). Em vez de baixar malhas prontas, cada peça
é gerada em código com primitivas do Three.js, então não há arquivos de modelo nem licenças de terceiros no repositório.

## Licença

MIT
