export const HELP_HTML = `
<div class="help">
<h4>Objetivo</h4>
<p>Duas duplas: uma com os <b>tacos</b> (rebatedores) e outra com a <b>bola</b> (lançadores). Os rebatedores marcam pontos
cruzando os tacos no meio do campo; os lançadores tentam derrubar a casinha (tripé) do adversário para pegar os tacos.</p>

<h4>Controles</h4>
<ul>
<li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / setas: mover livremente · <kbd>Shift</kbd>: correr (gasta fôlego) · mouse: mirar</li>
<li><b>Rebatedor</b>: <kbd>Clique</kbd> rebate na direção do mouse (acerte o tempo!) · <kbd>Espaço</kbd> bate os tacos no meio ·
<kbd>N</kbd> "nada" · <kbd>L</kbd> licença</li>
<li><b>Lançador</b>: segure <kbd>Clique</kbd> para carregar a força e solte para lançar · <kbd>F</kbd> ou botão direito: queimar na mão ·
<kbd>R</kbd> "reta" · <kbd>P</kbd> "pátio"</li>
<li><kbd>T</kbd> pedir tempo · <kbd>V</kbd> câmera geral · roda do mouse: zoom · <kbd>Enter</kbd> conversar · <kbd>M</kbd> som · <kbd>H</kbd> esta ajuda</li>
</ul>

<h4>Como funciona</h4>
<ul>
<li>Cada rebatedor fica com o <b>taco no chão</b> dentro do círculo da sua base: a base fica <b>protegida</b> (anel verde).
Tirar o taco da base antes do lançamento deixa a casinha ser derrubada até pelo lançador do mesmo lado.</li>
<li>Os lançadores ficam atrás das bases e lançam <b>sempre de trás da base do seu lado</b> na casinha do outro lado.
Derrubou a casinha: <b>troca</b> — quem lançava pega os tacos.</li>
<li>Rebateu? Enquanto os lançadores buscam a bola, os rebatedores correm, se encontram <b>lado a lado no meio</b>,
<b>batem os tacos</b> e encostam o taco na base oposta: <b>ponto</b>. Dá para repetir até um lançador voltar para trás de
uma base com a bola. Se os lançadores chegarem antes, podem queimar a casinha (com a bola na mão ou arremessando).</li>
<li><b>Fim de jogo</b>: atingir a pontuação combinada (5, 10, 12, 24 ou 100) e <b>cruzar os tacos</b> mais uma vez.
O jogo encerra na hora do cruzamento, mesmo que a casinha caia depois.</li>
</ul>

<h4>Regras do jogo (configuráveis na sala)</h4>
<ul>
<li><b>Quem começa</b>: molhado ou seco, par ou ímpar, último palmo (pêndulo de 10s) ou sorteio.</li>
<li><b>Vitória</b>: pegar a bola rebatida no ar, sem quicar — os adversários perdem o taco, perdem o taco e você ganha 2 pontos,
ou vitória automática (conforme a região).</li>
<li><b>Pra trás</b>: a bola bateu no taco e foi para trás do círculo = "uma pra trás". Três pra trás: perde os tacos.
Marcar ponto desconta os "pra trás". Na pontuação máxima pode não ter "trás".</li>
<li><b>Lancha / carne</b>: a bola encostou no corpo do rebatedor. Três na lancha perde o taco (ou perde 4 pontos no PR,
ou pênalti de perto no RS, ou perde na hora).</li>
<li><b>Reta / bete-ombro</b>: a bola rebatida parou entre as casinhas — o lançador pede "reta" e arremessa de onde ela parou,
com o rebatedor de taco no ombro. Se o rebatedor pedir "nada" antes, o lançador volta para trás da base.</li>
<li><b>Pátio / bolinha perdida</b>: bola no mato (fora da cerca). Os rebatedores marcam até os lançadores gritarem "pátio";
então ganham pontos extras pela interrupção (ou a vitória, se combinado).</li>
<li><b>Licença</b>: o rebatedor pode tirar o taco do chão sem ser queimado se pedir licença (não dá para correr enquanto isso).</li>
<li><b>Tempo</b> ("licença betes", "tempo-para-dois"): pausa até 100s; pode custar "uma pra trás".
Quem sumir sem pedir tempo vira <b>bete morto</b> e a casinha dele pode ser derrubada.</li>
<li><b>Na pontuação máxima</b>, perder o taco pode derrubar os pontos pela metade.</li>
<li><b>Final paulista</b> (opcional): ao cruzar na máxima, os rebatedores ficam de pé sobre os tacos e os lançadores têm um
arremesso de onde pegarem a bola: acertou, os rebatedores perdem metade da meta e seguem; errou, perderam o jogo.</li>
</ul>
</div>`;
