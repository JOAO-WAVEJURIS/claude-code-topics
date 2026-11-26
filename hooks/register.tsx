import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const PANE = 'topicos'
const PADRAO = ''
const CHUNK = 4 * 1024 * 1024

const pathA = atom({ plugin: 'topicos', key: 'path' } as const, PADRAO)
const openA = atom({ plugin: 'topicos', key: 'open' } as const, -1)
const revA = atom({ plugin: 'topicos', key: 'rev' } as const, 0)
const hitA = atom({ plugin: 'topicos', key: 'hit' } as const, '')

type Topico = { nivel: number; titulo: string; corpo: string[] }
type Msg = { id: string; t: string; quem: string; texto: string; norm: string }

const PARADAS = new Set(('para pela pelo pelos pelas como mais muito sobre entre depois antes ainda sempre quando onde '
  + 'esta este isso essa esse aqui agora tudo todo toda todos todas cada outro outra outros outras nao sim '
  + 'foram ficou fica ficam feito feita fazer pode podem deve devem desta deste dessa desse nesta neste '
  + 'nessa nesse numa umas uns seus suas dele dela eles elas voce porque tambem tem tinha serao sera estao '
  + 'arquivo arquivos pasta curso cursos aula aulas video videos').split(' '))

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function limpar(l: string): string {
  let s = l.replace(/\*\*|__|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  if (/^\s*\|?\s*:?-{3,}/.test(s)) return ''
  if (s.trim().startsWith('|')) {
    s = s.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()).join(' · ')
  }
  return s.replace(/^(\s*)[-*] /, '$1• ')
}

function analisar(txt: string): { titulo: string; topicos: Topico[] } {
  let titulo = ''
  const topicos: Topico[] = []
  for (const linha of txt.split(/\r?\n/)) {
    const m = /^(#{1,6})\s+(.*)$/.exec(linha)
    if (m) {
      const marca = m[1] ?? '#'
      const nome = (m[2] ?? '').trim()
      if (marca.length === 1 && titulo === '') { titulo = nome; continue }
      topicos.push({ nivel: marca.length, titulo: nome, corpo: [] })
      continue
    }
    const t = topicos[topicos.length - 1]
    if (t) {
      const c = limpar(linha)
      if (c.trim() !== '' || (t.corpo.length > 0 && t.corpo[t.corpo.length - 1] !== '')) t.corpo.push(c)
    }
  }
  const minimo = Math.min(...topicos.map(t => t.nivel), 9)
  topicos.forEach(t => { t.nivel = t.nivel - minimo })
  return { titulo, topicos }
}

function palavras(s: string): string[] {
  return [...new Set(norm(s).split(/[^a-z0-9/]+/).filter(w => w.length >= 4 && !PARADAS.has(w) && !/^\d+$/.test(w)))]
}

// Histórico da conversa: lido do arquivo da sessão aos pedaços, só o que é novo.
let lido = 0
let resto = ''
let arquivo = ''
const msgs: Msg[] = []

function textoDe(d: any): string {
  const c = d?.message?.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.filter((b: any) => b?.type === 'text').map((b: any) => String(b.text ?? '')).join('\n')
  return ''
}

function guardar(linha: string) {
  if (!linha.includes('"type":"user"') && !linha.includes('"type":"assistant"')) return
  let d: any
  try { d = JSON.parse(linha) } catch { return }
  if (d.isSidechain || (d.type !== 'user' && d.type !== 'assistant')) return
  if (d.type === 'user' && typeof d?.message?.content !== 'string') return
  let texto = textoDe(d).trim()
  if (texto === '' || texto.startsWith('<') || texto.startsWith('This session is being continued')) return
  texto = texto.slice(0, 4000)
  msgs.push({ id: String(d.uuid ?? msgs.length), t: String(d.timestamp ?? ''), quem: d.type === 'user' ? 'Você' : 'Claude', texto, norm: norm(texto) })
}

async function carregar($: any) {
  if (arquivo === '') {
    const info = await $.session.info()
    arquivo = String(info?.transcriptPath ?? '')
    if (arquivo === '') return
  }
  const st = await $.fs.stat(arquivo).catch(() => undefined)
  if (!st) return
  if (st.size < lido) { lido = 0; resto = ''; msgs.length = 0 }
  const dec = new TextDecoder()
  while (lido < st.size) {
    const tam = Math.min(CHUNK, st.size - lido)
    const { base64 } = await $.fs.read(arquivo, { as: 'bytes', offset: lido, length: tam })
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    // corta no último fim de linha, para não partir um caractere entre pedaços
    let fim = bytes.length - 1
    while (fim >= 0 && bytes[fim] !== 10) fim--
    if (fim < 0) {
      if (tam < CHUNK) { lido += tam; guardar(resto + dec.decode(bytes)); resto = '' }
      else { lido += tam; resto += dec.decode(bytes) }
      continue
    }
    lido += fim + 1
    const txt = resto + dec.decode(bytes.subarray(0, fim + 1))
    resto = ''
    for (const l of txt.split('\n')) guardar(l)
  }
}

async function caminho($: any): Promise<string> {
  const p = await read($, pathA)
  if (p !== '') return p
  const ultimo = await $.store.get('ultimo')
  return typeof ultimo === 'string' ? ultimo : ''
}

async function escolher($: any, p: string) {
  await update($, pathA, () => p)
  await update($, openA, () => -1)
  await update($, hitA, () => '')
  await $.store.set('ultimo', p)
}

function quando(iso: string): string {
  const d = new Date(Date.parse(iso) - 3 * 3600 * 1000)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

function trechos(t: Topico): { m: Msg; trecho: string }[] {
  const doTitulo = palavras(t.titulo.replace(/^[\d.]+\s*/, ''))
  const doCorpo = palavras(t.corpo.join(' ')).slice(0, 40)
  const pont = msgs.map(m => {
    let s = 0
    for (const w of doTitulo) if (m.norm.includes(w)) s += 3
    for (const w of doCorpo) if (m.norm.includes(w)) s += 1
    if (m.quem === 'Você') s += 1
    return { m, s }
  }).filter(x => x.s >= 5)
  pont.sort((a, b) => b.s - a.s)
  const top = pont.slice(0, 6).sort((a, b) => a.m.t.localeCompare(b.m.t))
  const chaves = [...doTitulo, ...doCorpo]
  return top.map(({ m }) => {
    let pos = -1
    for (const w of chaves) { const i = m.norm.indexOf(w); if (i >= 0) { pos = i; break } }
    const ini = Math.max(0, pos - 60)
    const pedaco = m.texto.slice(ini, ini + 180).replace(/\s+/g, ' ').trim()
    return { m, trecho: (ini > 0 ? '…' : '') + pedaco + '…' }
  })
}

export const register: Register = on => {
  let visto = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'topicos',
      description: 'Abre o painel de tópicos. Uso: /topicos [caminho do .md]',
    })
    await $.command.register({
      name: 'topicos-gerar',
      description: 'Gera um .md com os tópicos desta conversa e abre no painel. Uso: /topicos-gerar [pasta ou arquivo .md]',
    })
    $.clock.every(4000, async () => {
      const p = await caminho($)
      if (p === '') return
      const st = await $.fs.stat(p).catch(() => undefined)
      const mt = st?.mtimeMs ?? 0
      if (mt !== visto) { visto = mt; await update($, revA, r => r + 1) }
    })
    return next(e)
  })

  on('command.run', { command: 'topicos-gerar' }, async ($, e) => {
    const agora = new Date(Date.now() - 3 * 3600 * 1000)
    const p2 = (n: number) => String(n).padStart(2, '0')
    const carimbo = `${agora.getUTCFullYear()}-${p2(agora.getUTCMonth() + 1)}-${p2(agora.getUTCDate())}_${p2(agora.getUTCHours())}${p2(agora.getUTCMinutes())}`
    let destino = e.args.trim().replace(/^["']|["']$/g, '')
    if (destino === '') destino = `${await $.session.cwd()}/TOPICOS-CONVERSA-${carimbo}.md`
    else if (!/\.md$/i.test(destino)) destino = `${destino.replace(/[\\/]$/, '')}/TOPICOS-CONVERSA-${carimbo}.md`
    $.ui.toast('Montando os tópicos desta conversa…')
    const r = await $.model.fork({
      effort: 'medium',
      prompt:
        'Monte, em português do Brasil, um arquivo Markdown que organize ESTA conversa inteira por tópicos, para leitura. '
        + 'Formato obrigatório: primeira linha "# <título curto da conversa>"; depois uma linha "Gerado em <data e hora>"; '
        + 'depois um "## N. <tópico>" para cada assunto tratado, na ordem em que apareceu, com "### N.M <subtópico>" quando ajudar. '
        + 'Debaixo de cada título, de 2 a 8 linhas com "- " contando o que foi pedido, o que foi feito, o resultado, os números, '
        + 'as datas e os caminhos de arquivo exatos. Não invente nada que não esteja na conversa. '
        + 'Termine com "## O que falta", listando as pendências. Responda só com o Markdown, sem nenhum texto antes ou depois.',
    })
    if (!r.isAnswered) return { text: `Não consegui gerar os tópicos (${r.reason}).` }
    const md = r.text.replace(/^```(?:markdown|md)?\s*\n/, '').replace(/\n```\s*$/, '').trim() + '\n'
    await $.fs.write(destino, md)
    await escolher($, destino)
    await $.ui.open({ id: PANE, title: 'Tópicos' })
    return { text: `Tópicos gerados e abertos no painel: ${destino}` }
  })

  on('command.run', { command: 'topicos' }, async ($, e) => {
    const arg = e.args.trim().replace(/^["']|["']$/g, '')
    if (arg !== '') {
      if (!(await $.fs.exists(arg))) return { text: `Não achei o arquivo: ${arg}` }
      await escolher($, arg)
    }
    const r = await $.ui.open({ id: PANE, title: 'Tópicos' })
    const p = await caminho($)
    if (p === '') return { text: 'Painel aberto. Escolha um arquivo: /topicos <caminho do arquivo .md>, ou gere um desta conversa com /topicos-gerar.' }
    return {
      text: r.isPlaced
        ? `Painel de tópicos aberto: ${p}`
        : `Painel pronto (${p}). Ele aparece quando a janela do terminal estiver larga o bastante.`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, revA)
    const p = await caminho($)
    const aberto = await read($, openA)
    const hit = await read($, hitA)
    if (p === '') {
      return (
        <Box flexDirection="column">
          <Text bold>Tópicos</Text>
          <Text dimColor>Nenhum arquivo escolhido ainda.</Text>
          <Text>{'/topicos <caminho do arquivo .md>'}</Text>
          <Text>/topicos-gerar  (monta um .md desta conversa)</Text>
        </Box>
      )
    }
    let txt = ''
    try { txt = await $.fs.read(p) } catch {
      return (
        <Box flexDirection="column">
          <Text color="red">Não consegui ler o arquivo:</Text>
          <Text>{p}</Text>
          <Text dimColor>{'Use /topicos <caminho do arquivo .md>'}</Text>
        </Box>
      )
    }
    const { titulo, topicos } = analisar(txt)
    const nome = p.split(/[\\/]/).pop() ?? p
    const sel = topicos[aberto]
    let achados: { m: Msg; trecho: string }[] = []
    if (sel) { await carregar($); achados = trechos(sel) }
    const corpo = sel ? sel.corpo.slice(0, 14) : []
    return (
      <Box flexDirection="column">
        <Text bold>{titulo || nome}</Text>
        <Text dimColor>{nome}</Text>
        <Text> </Text>
        {topicos.length === 0 && <Text dimColor>Este arquivo não tem títulos (#).</Text>}
        {topicos.map((t, i) => (
          <Button
            key={`t${i}`}
            onPress={async () => {
              await update($, hitA, () => '')
              await update($, openA, o => (o === i ? -1 : i))
            }}
          >
            {'  '.repeat(t.nivel)}{i === aberto ? '▾ ' : '▸ '}
            <Text bold={t.nivel === 0}>{t.titulo}</Text>
          </Button>
        ))}
        {sel && (
          <Box flexDirection="column" marginTop={1} borderStyle="round" paddingX={1}>
            <Text bold color="cyan">{sel.titulo}</Text>
            {corpo.length === 0 && <Text dimColor>(sem texto; veja os subtópicos)</Text>}
            {corpo.map(l => <Text wrap="wrap">{l === '' ? ' ' : l}</Text>)}
            {sel.corpo.length > 14 && <Text dimColor>… continua no arquivo</Text>}
          </Box>
        )}
        {sel && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="yellow">Na conversa ({achados.length})</Text>
            {achados.length === 0 && <Text dimColor>Nada encontrado na conversa para este tópico.</Text>}
            {achados.map(({ m, trecho }) => (
              <Box flexDirection="column" marginTop={1}>
                <Button
                  key={`c${m.id}`}
                  onPress={() => update($, hitA, h => (h === m.id ? '' : m.id))}
                >
                  {hit === m.id ? '▾ ' : '▸ '}
                  <Text bold>{quando(m.t)} · {m.quem}</Text>
                </Button>
                <Text wrap="wrap" dimColor={hit !== m.id}>
                  {hit === m.id ? m.texto.slice(0, 2500) + (m.texto.length > 2500 ? ' …' : '') : trecho}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
