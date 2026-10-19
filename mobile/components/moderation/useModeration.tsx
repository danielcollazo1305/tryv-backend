import React, { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { EditCaptionSheet, VisibilitySheet } from '@/components/moderation/EditPostSheets';
import { ReportSheet } from '@/components/moderation/ReportSheet';
import { CAPTION_MAX_LENGTH } from '@/constants/textLimits';
import { getContentFilterMessage } from '@/services/contentFilter';
import {
  MenuActionKey,
  PostEditError,
  PostVisibilityChoice,
  buildMenuOptions,
  classifyPostEditError,
  menuTitle,
} from '@/services/postEdit';
import { Post, updatePost } from '@/services/social';
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
  /** Conteudo meu: post meu ganha Editar legenda / Mudar privacidade / Excluir (conforme os callbacks passados); comentario meu nao abre menu. */
  isOwn: boolean;
  /** Legenda e privacidade atuais, so para post MEU (a folha de edicao parte deles). */
  caption?: string | null;
  visibility?: string;
};

interface ModerationOptions {
  /** Post MEU editado (legenda/privacidade): o chamador troca o post na tela. Passar este callback liga "Editar legenda" e "Mudar privacidade". */
  onPostUpdated?: (post: Post) => void;
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
export function useModeration({ onDeletePost, onBlocked, onContentRemoved, onPostUpdated }: ModerationOptions) {
  const [reportTarget, setReportTarget] = useState<ModerationTarget | null>(null);
  const [editCaptionTarget, setEditCaptionTarget] = useState<ModerationTarget | null>(null);
  const [visibilityTarget, setVisibilityTarget] = useState<ModerationTarget | null>(null);
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
      const options = buildMenuOptions({
        kind: target.kind,
        isOwn: target.isOwn,
        authorName: target.authorName,
        canEdit: !!onPostUpdated,
        canDelete: !!onDeletePost,
      });
      if (options.length === 0) return;
      const handlers: Record<MenuActionKey, (() => void) | undefined> = {
        edit_caption: () => setEditCaptionTarget(target),
        edit_visibility: () => setVisibilityTarget(target),
        delete: () => confirmDeletePost(() => onDeletePost?.(target.id)),
        report: () => {
          pendingRemovalRef.current = null;
          setReportTarget(target);
        },
        block: () => confirmBlock(target),
        cancel: undefined,
      };
      Alert.alert(
        menuTitle(target.kind, target.isOwn),
        undefined,
        options.map((option) => ({
          text: option.label,
          style: option.style,
          onPress: handlers[option.key],
        }))
      );
    },
    [confirmBlock, onDeletePost, onPostUpdated]
  );

  // Edicao do PROPRIO post: erro volta traduzido para a folha (que continua aberta); sucesso troca o post na tela.
  const runPostUpdate = useCallback(
    async (target: ModerationTarget | null, body: { caption?: string; visibility?: PostVisibilityChoice }, draftLength: number): Promise<PostEditError | null> => {
      if (!target) return null;
      try {
        const updated = await updatePost(target.id, body);
        onPostUpdated?.(updated);
        return null;
      } catch (err) {
        return classifyPostEditError(err, getContentFilterMessage(err), draftLength, CAPTION_MAX_LENGTH);
      }
    },
    [onPostUpdated]
  );
  const saveCaption = useCallback(
    (caption: string) => runPostUpdate(editCaptionTarget, { caption }, caption.length),
    [editCaptionTarget, runPostUpdate]
  );
  const saveVisibility = useCallback(
    (visibility: PostVisibilityChoice) => runPostUpdate(visibilityTarget, { visibility }, 0),
    [runPostUpdate, visibilityTarget]
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
    <>
      <ReportSheet
        visible={reportTarget !== null}
        kind={reportTarget?.kind ?? 'post'}
        onClose={handleCloseSheet}
        onSubmit={submitReport}
      />
      <EditCaptionSheet
        visible={editCaptionTarget !== null}
        initialCaption={editCaptionTarget?.caption ?? null}
        onClose={() => setEditCaptionTarget(null)}
        onSave={saveCaption}
      />
      <VisibilitySheet
        visible={visibilityTarget !== null}
        current={visibilityTarget?.visibility ?? 'public'}
        onClose={() => setVisibilityTarget(null)}
        onSelect={saveVisibility}
      />
    </>
  );

  return { openMenu, sheet };
}
