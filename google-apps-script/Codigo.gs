// Planilha "Pedidos OS digital GC" — recebe pedidos do site e acrescenta linhas.
// Cole este código em Extensões > Apps Script, dentro da própria planilha.

var CABECALHO = [
  'ID do pedido', 'Data e hora do envio', 'Paciente', 'Dentista',
  'Tipo de trabalho', 'Dentes', 'Material', 'Cor', 'Prazo desejado',
  'Data da instalação agendada', 'Quem preencheu', 'Observações', 'Link das fotos'
];

function doPost(e) {
  var trava = LockService.getScriptLock();
  try {
    trava.waitLock(30000);
    var dados = JSON.parse(e.postData.contents);
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
