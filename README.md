# Claude Code - Topics

Um painel que fica ao lado da conversa do Claude Code, no terminal, e organiza a leitura por tópicos.

- **`/topicos <arquivo.md>`** abre o painel com os títulos (`#`, `##`, `###`) de um arquivo Markdown. Clique num tópico para ler o trecho dele ali mesmo; clique de novo para fechar.
- **Na conversa:** ao abrir um tópico, o painel procura no histórico da sessão atual as mensagens ligadas àquele assunto e mostra cada uma com data, hora e quem falou. Clique numa delas para ler a mensagem inteira.
- **`/topicos-gerar [pasta ou arquivo.md]`** pede ao próprio Claude da sessão um `.md` com os tópicos desta conversa, grava o arquivo (por padrão na pasta da sessão, como `TOPICOS-CONVERSA-<data>.md`) e já o abre no painel. Essa chamada conta no uso da sessão, como qualquer outra pergunta ao Claude.
- O painel lembra o último arquivo usado e se atualiza sozinho quando o arquivo muda.

O painel aparece quando a janela do terminal é larga o bastante (cerca de 110 a 144 colunas). O terminal não deixa um painel rolar a conversa até uma mensagem antiga, então os trechos da conversa são mostrados dentro do próprio painel.

## Instalar

No prompt de uma sessão do Claude Code no terminal:

```
/plugin install topicos --marketplace JOAO-WAVEJURIS/claude-code-topics
```

Responda `y` para adicionar o marketplace e escolha o escopo com Enter.

Pelo shell:

```
claude plugin install topicos --marketplace JOAO-WAVEJURIS/claude-code-topics
```

No app de desktop, onde `/plugin` não roda: clique no + ao lado da caixa de mensagem, depois Plugins, Add marketplace com `JOAO-WAVEJURIS/claude-code-topics`, e então Add plugin.

## English

A side pane for Claude Code that lists the headings of a Markdown file, shows each section when clicked, finds the related messages in the current conversation, and can generate a topics file for the conversation with `/topicos-gerar`. Install with `/plugin install topicos --marketplace JOAO-WAVEJURIS/claude-code-topics`.

## Licença

MIT.
