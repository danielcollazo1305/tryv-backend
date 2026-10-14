import React, { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { ReportSheet } from '@/components/moderation/ReportSheet';
import {
  ModerationError,
  ReportReason,
  blockUser,
  classifyModerationError,
  reportComment,
  reportPost,
} from '@/services/moderation';

export type ModerationTarget = {
  kind: 'post' | 'comment';
  id: string;
  authorId: string;
  authorName: string;
  /** Conteudo meu: post meu so ganha "Excluir" (se `onDeletePost` for passado); comentario meu nao abre menu. */
  isOwn: boolean;
};

interface ModerationOptions {
  /** Excluir post MEU (o chamador reaproveita o fluxo/servico de exclusao que ja tem). */
  onDeletePost?: (postId: string) => void;
  /** Bloqueio concluido: o chamador remove da tela o que for dessa pessoa. */
  onBlocked?: (userId: string) => void;
  /** Denuncia enviada (ou conteudo indisponivel / 404): o chamador remove o item da tela. */
  onContentRemoved?: (target: ModerationTarget) => void;
}

/** Texto de confirmacao de exclusao de post (o mesmo da tela de detalhe do post). */
export function confirmDeletePost(onConfirm: () => void) {
  Alert.alert('Excluir post?', 'Essa acao nao pode ser desfeita.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: onConfirm },
  ]);
}

/**
 * Menu "⋯" de um post ou comentario + confirmacao de bloqueio + folha de denuncia. Usa o Alert nativo (o padrao do
 * app; nao ha ActionSheet em nenhuma outra tela). Renderize `sheet` uma vez na tela:
 *   const { openMenu, sheet } = useModeration({...});  ...  {sheet}
 */
export function useModeration({ onDeletePost, onBlocked, onContentRemoved }: ModerationOptions) {
  const [reportTarget, setReportTarget] = useState<ModerationTarget | null>(null);
  // Item a remover da tela: guardado quando a denuncia da certo (ou o conteudo ja nao existe) e so aplicado quando a
  // folha FECHA, para a pessoa ver a confirmacao antes de a tela mudar (na tela de detalhe do post o callback fecha a
  // propria tela). Fechar depois de um erro de rede, sem ter enviado, nao remove nada.
  const pendingRemovalRef = useRef<ModerationTarget | null>(null);

  const confirmBlock = useCallback(
    (target: ModerationTarget) => {
      Alert.alert(
        `Bloquear ${target.authorName}?`,
        'Você não verá mais os posts dessa pessoa e ela não verá os seus. Você pode desbloquear depois em Perfil > Usuários bloqueados.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Bloquear',
            style: 'destructive',
            onPress: async () => {
              try {
                await blockUser(target.authorId);
                onBlocked?.(target.authorId);
              } catch (err) {
                const failure = classifyModerationError(err, 'Não foi possível bloquear. Tente novamente.');
                Alert.alert('Não foi possível bloquear', failure.message);
              }
            },
          },
        ]
      );
    },
    [onBlocked]
  );

  const openMenu = useCallback(
    (target: ModerationTarget) => {
      if (target.isOwn) {
        if (target.kind === 'post' && onDeletePost) {
          Alert.alert('Seu post', undefined, [
            { text: 'Excluir', style: 'destructive', onPress: () => confirmDeletePost(() => onDeletePost(target.id)) },
            { text: 'Cancelar', style: 'cancel' },
          ]);
        }
        return;
      }
      Alert.alert(target.kind === 'post' ? 'Opções do post' : 'Opções do comentário', undefined, [
        {
          text: 'Denunciar',
          onPress: () => {
            pendingRemovalRef.current = null;
            setReportTarget(target);
          },
        },
        { text: `Bloquear ${target.authorName}`, style: 'destructive', onPress: () => confirmBlock(target) },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    },
    [confirmBlock, onDeletePost]
  );

  const submitReport = useCallback(
    async (reason: ReportReason, details: string): Promise<ModerationError | null> => {
      const target = reportTarget;
      if (!target) return null;
      try {
        if (target.kind === 'post') await reportPost(target.id, reason, details);
        else await reportComment(target.id, reason, details);
        // 201 (nova) e 200 (ja denunciada) chegam aqui igual. O servidor ja esconde o item de quem denunciou.
        pendingRemovalRef.current = target;
        return null;
      } catch (err) {
        const failure = classifyModerationError(err, 'Não foi possível enviar a denúncia. Tente novamente.');
        if (failure.kind === 'content_unavailable') pendingRemovalRef.current = target;
        return failure;
      }
    },
    [reportTarget]
  );

  // Unico caminho de fechamento da folha (botao X, "Fechar", toque fora, botao voltar do Android): aplica a remocao pendente.
  const handleCloseSheet = useCallback(() => {
    const pending = pendingRemovalRef.current;
    pendingRemovalRef.current = null;
    setReportTarget(null);
    if (pending) onContentRemoved?.(pending);
  }, [onContentRemoved]);

  const sheet = (
    <ReportSheet
      visible={reportTarget !== null}
      kind={reportTarget?.kind ?? 'post'}
      onClose={handleCloseSheet}
      onSubmit={submitReport}
    />
  );

  return { openMenu, sheet };
}
