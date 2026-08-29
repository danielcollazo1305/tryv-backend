import React from 'react';
import { router } from 'expo-router';

import { EditorialCard } from '@/components/EditorialCardV2';

/**
 * "Relatorio em PDF" — slide do carrossel "Para voce" da Home. Antes era um
 * card fixo sempre visivel (data inicial/final + botao "Gerar PDF") — agora
 * so a entrada visual, que abre a mesma tela de exportacao (ver
 * app/export-pdf.tsx, logica/validacao identica, so mudou de lugar).
 *
 * Reaproveita a imagem "acompanhamento-profissional-card.png" (sem uso
 * desde que TrainersHighlight foi escondida do marketplace pre-lancamento —
 * ver (tabs)/index.tsx) em vez de precisar de um asset novo. O label de
 * acessibilidade continua descrevendo a FOTO em si (personal trainer com
 * aluno), nao o destino do link — mesmo padrao dos outros slides, a
 * legenda de tela precisa descrever a imagem real, mesmo reaproveitada
 * pra um contexto diferente do original.
 */
export function ExportPdfCard() {
  return (
    <EditorialCard
      image={require('../assets/imagens/acompanhamento-profissional-card.png')}
      icon="document-text"
      categoryLabel="Relatório"
      title="Relatório em PDF"
      subtitle="Exporte seu progresso no período que você escolher."
      accessibilityLabel="Personal trainer orientando um aluno durante o treino"
      onPress={() => router.push('/export-pdf')}
      ctaLabel="Exportar PDF"
    />
  );
}
