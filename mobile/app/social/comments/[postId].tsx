import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { ModerationTarget, useModeration } from '@/components/moderation/useModeration';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api';
import { COMMENT_MAX_LENGTH } from '@/constants/textLimits';
import { getContentFilterMessage } from '@/services/contentFilter';
import { Comment, createComment, deleteComment, formatPostDate, listComments } from '@/services/social';
import { colors, radius, spacing, typography } from '@/constants/theme';

function CommentRow({
  comment,
  canDelete,
  onDelete,
  onPressMore,
  onPressAuthor,
}: {
  comment: Comment;
  canDelete: boolean;
  onDelete: () => void;
  /** Menu "⋯" so em comentario de OUTRA pessoa (denunciar/bloquear). */
  onPressMore?: () => void;
  /** Abre o perfil de quem comentou (/social/[userId]). */
  onPressAuthor?: () => void;
}) {
  return (
    <View style={styles.commentRow}>
      <Pressable onPress={onPressAuthor} disabled={!onPressAuthor} style={styles.avatar} accessibilityRole="button" accessibilityLabel={`Abrir o perfil de ${comment.author}`}>
        <Ionicons name="person" size={14} color={colors.accent} />
      </Pressable>
      <View style={styles.commentInfo}>
        <Text style={styles.commentText}>
          <Text style={styles.commentAuthor} onPress={onPressAuthor} accessibilityRole="link">
            {comment.author}{' '}
          </Text>
          {comment.content}
        </Text>
        <Text style={styles.commentDate}>{formatPostDate(comment.created_at)}</Text>
      </View>
      {canDelete && (
        <Pressable onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </Pressable>
      )}
      {!!onPressMore && (
        <Pressable
          onPress={onPressMore}
          style={styles.moreButton}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Mais opções"
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

export default function CommentsScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { user } = useAuth();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      setComments(await listComments(postId));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os comentarios.'));
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useFocusEffect(
    useCallback(() => {
      fetchComments();
    }, [fetchComments])
  );

  const handleSend = async () => {
    if (!postId || !content.trim()) return;
    setSending(true);
    setError(null);
    try {
      const comment = await createComment(postId, content.trim());
      setComments((prev) => [...prev, comment]);
      setContent('');
    } catch (err) {
      // Texto barrado (422) ou pausa (429): mensagem do servidor; o comentario digitado FICA no campo para editar.
      setError(getContentFilterMessage(err) ?? getApiErrorMessage(err, 'Nao foi possivel enviar o comentario.'));
    } finally {
      setSending(false);
    }
  };

  // Moderacao: bloquear tira da lista todos os comentarios da pessoa; denunciar tira o comentario denunciado (o feed
  // se atualiza sozinho ao voltar para ele, pois recarrega ao ganhar foco).
  const { openMenu, sheet } = useModeration({
    onBlocked: (blockedId) => setComments((prev) => prev.filter((c) => c.user_id !== blockedId)),
    onContentRemoved: (target: ModerationTarget) => {
      if (target.kind === 'comment') setComments((prev) => prev.filter((c) => c.id !== target.id));
    },
  });

  const handleDelete = async (comment: Comment) => {
    try {
      await deleteComment(comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel excluir o comentario.'));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>Comentarios</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={comments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <CommentRow
              comment={item}
              canDelete={item.user_id === user?.id}
              onDelete={() => handleDelete(item)}
              onPressAuthor={() => router.push({ pathname: '/social/[userId]', params: { userId: item.user_id } })}
              onPressMore={
                item.user_id === user?.id
                  ? undefined
                  : () =>
                      openMenu({
                        kind: 'comment',
                        id: item.id,
                        authorId: item.user_id,
                        authorName: item.author,
                        isOwn: false,
                      })
              }
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nenhum comentario ainda. Seja o primeiro!</Text>
            </View>
          }
        />
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Escreva um comentario..."
          placeholderTextColor={colors.textMuted}
          value={content}
          onChangeText={setContent}
          maxLength={COMMENT_MAX_LENGTH}
          multiline
        />
        <Pressable
          style={[styles.sendButton, (!content.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!content.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="send" size={18} color={colors.white} />
          )}
        </Pressable>
      </View>
      {sheet}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: { ...typography.h2 },
  error: { color: colors.danger, textAlign: 'center', marginBottom: spacing.sm },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { flex: 1 },
  listContent: { padding: spacing.lg, paddingTop: 0, gap: spacing.md, flexGrow: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  emptyText: { ...typography.bodySecondary, textAlign: 'center' },

  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentInfo: { flex: 1, gap: spacing.xs },
  moreButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginRight: -10 },
  commentText: { ...typography.bodySecondary, color: colors.text },
  commentAuthor: { fontWeight: '700', color: colors.text },
  commentDate: { ...typography.caption },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    color: colors.text,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
});
