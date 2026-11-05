// Planilha "Pedidos OS digital GC" — recebe pedidos do site e acrescenta linhas.
// Cole este código em Extensões > Apps Script, dentro da própria planilha.

var CABECALHO = [
  'ID do pedido', 'Data e hora do envio', 'Paciente', 'Dentista',
  'Tipo de trabalho', 'Dentes', 'Material', 'Cor', 'Prazo desejado',
  'Data da instalação agendada', 'Quem preencheu', 'Observações', 'Link das fotos'
];

// Pasta raiz no Google Drive onde ficam os arquivos dos casos:
//   OS digital GC — Arquivos / <Dentista> / <Paciente – GC-0001> / arquivo.stl
var PASTA_RAIZ = 'OS digital GC — Arquivos';

function doPost(e) {
  var dados0 = JSON.parse(e.postData.contents);
  if (dados0.acao === 'arquivo') return salvarArquivo(dados0);
  var trava = LockService.getScriptLock();
  try {
    trava.waitLock(30000);
    var dados = dados0;
    var linhas = dados.linhas || [];
    var aba = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    if (aba.getLastRow() === 0) {
      aba.appendRow(CABECALHO);
      aba.getRange(1, 1, 1, CABECALHO.length).setFontWeight('bold');
      aba.setFrozenRows(1);
    }

    // Ids que já estão na planilha (para nunca duplicar um pedido).
    var existentes = {};
    var ultima = aba.getLastRow();
    if (ultima > 1) {
      aba.getRange(2, 1, ultima - 1, 1).getValues().forEach(function (l) {
        existentes[String(l[0])] = true;
      });
    }

    var novas = [];
    linhas.forEach(function (linha) {
      var id = String(linha[0]);
      if (!id || existentes[id]) return;
      existentes[id] = true;
      var limpa = [];
      for (var i = 0; i < CABECALHO.length; i++) {
        var v = linha[i] == null ? '' : String(linha[i]);
        // Impede que um texto começando com = + - @ vire fórmula.
        if (/^[=+\-@]/.test(v)) v = "'" + v;
        limpa.push(v);
      }
      novas.push(limpa);
    });

    if (novas.length > 0) {
      var destino = aba.getRange(aba.getLastRow() + 1, 1, novas.length, CABECALHO.length);
      destino.setNumberFormat('@'); // texto puro: mantém datas e dentes como enviados
      destino.setValues(novas);
    }

    return resposta({ ok: true, adicionados: novas.length, ignorados: linhas.length - novas.length });
  } catch (erro) {
    return resposta({ ok: false, erro: String(erro) });
  } finally {
    trava.releaseLock();
  }
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Baixa o arquivo do servidor do site (link temporário) e salva no Drive,
// na pasta do dentista / paciente. Se já existir um arquivo com o mesmo nome
// nessa pasta, não duplica: devolve o que já está lá.
function salvarArquivo(d) {
  try {
    // Trava só a criação das pastas, para dois arquivos do mesmo caso não
    // criarem a mesma pasta duas vezes.
    var trava = LockService.getScriptLock();
    trava.waitLock(30000);
    var pasta;
    try {
      pasta = pastaPorCaminho([PASTA_RAIZ].concat(d.pastas || []));
    } finally {
      trava.releaseLock();
    }
    var existentes = pasta.getFilesByName(d.nome);
    if (existentes.hasNext()) {
      var f0 = existentes.next();
      return resposta({ ok: true, id: f0.getId(), url: f0.getUrl(), jaExistia: true });
    }
    var r = UrlFetchApp.fetch(d.url, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) {
      return resposta({ ok: false, erro: 'download falhou: HTTP ' + r.getResponseCode() });
    }
    var arquivo = pasta.createFile(r.getBlob().setName(d.nome));
    return resposta({ ok: true, id: arquivo.getId(), url: arquivo.getUrl() });
  } catch (erro) {
    return resposta({ ok: false, erro: String(erro) });
  }
}

function pastaPorCaminho(nomes) {
  var atual = DriveApp.getRootFolder();
  nomes.forEach(function (nome) {
    var limpo = String(nome || 'Sem nome').replace(/[\\/]/g, '-').trim() || 'Sem nome';
    var it = atual.getFoldersByName(limpo);
    atual = it.hasNext() ? it.next() : atual.createFolder(limpo);
  });
  return atual;
}
