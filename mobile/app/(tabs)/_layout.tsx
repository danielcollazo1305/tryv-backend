import React from 'react';
import {
  GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Tabs, router } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { colors3, spacing3 } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { getInitials } from '@/utils/text';

// Exportada — telas com ScrollView (Home, e as proximas que migrarem)
// precisam somar isso ao paddingBottom do conteudo, senao o ultimo item
// do scroll fica escondido atras da barra flutuante (ela nao empurra mais
// o layout como a barra fixa antiga empurrava via padding automatico do
// React Navigation).
// Valores EXATOS do Mizan (altura/raio/sombra/icone) — pedido explicito
// de replicar a estrutura original dele, nao a versao miniaturizada
// (48/16) de uma rodada anterior. So cor muda (roxo do Tryv em vez do
// dourado do Mizan), o resto e identico.
export const TAB_BAR_HEIGHT = 60;
const TAB_ICON_SIZE = 22;
// Botao central "Treinar": circulo CONTIDO na altura da barra (nao sobressai, entao nada que usa TAB_BAR_HEIGHT muda).
const CENTER_BUTTON_SIZE = 48;
// Foto do usuario na aba Perfil: aro (borda de 2 pt, roxa quando ativa) + foto redonda dentro.
const PROFILE_PHOTO_SIZE = 24;
const PROFILE_RING_SIZE = PROFILE_PHOTO_SIZE + 6;
const TAB_BAR_RADIUS = 30; // = height/2, mesmo valor literal do Mizan (nao radius3.pill=9999)
// Espaco entre a base segura da tela (insets.bottom) e a propria barra —
// mesmo valor usado no `bottom` do container abaixo, exportado pra quem
// for calcular o padding do scroll nao duplicar esse numero solto.
export const TAB_BAR_BOTTOM_GAP = spacing3.sm;
// Margem lateral FIXA (nao mais percentual) — arquitetura nova copiada do
// app Mizan (tabBar={(props) => <CustomTabBar .../>} em vez de
// tabBarStyle). O valor percentual anterior nunca chegava a aparecer no
// device (nem testando com valor absurdo, 80px, direto na prop
// tabBarStyle), o que confirma que a raiz do problema nao era o calculo
// da margem — era o MECANISMO (prop tabBarStyle) em si nao estar sendo
// aplicado pelo React Navigation nessa config do projeto. Um componente
// de tab bar totalmente customizado via `tabBar` contorna isso: quem
// desenha a barra agora somos nos, nao uma prop que nao respondia.
const TAB_BAR_SIDE_MARGIN = 18;

const ACTIVE_COLOR = colors3.primary;
const INACTIVE_COLOR = colors3.outline;

/**
 * Icone da aba Perfil: a FOTO do usuario (componente Avatar; sem foto = iniciais sobre o gradiente) no lugar do
 * icone. Redonda so aqui: o Avatar do app e quadrado (avatarRadius), mas a prop `style` e aplicada por ultimo,
 * entao `borderRadius: size / 2` basta (o componente Avatar nao e alterado). Menor de 18 anos tambem ve o proprio
 * avatar (a regra de core/avatar_visibility so esconde para os outros). Tamanho <= 64 usa a miniatura.
 */
function ProfileTabIcon({ focused }: { focused: boolean }) {
  const { user } = useAuth();
  return (
    <View style={[styles.profileRing, { borderColor: focused ? ACTIVE_COLOR : 'transparent' }]}>
      <Avatar
        initials={user ? getInitials(user.name) : '?'}
        imageUrl={user?.avatar_url}
        thumbUrl={user?.avatar_thumb_url}
        size={PROFILE_PHOTO_SIZE}
        style={{ borderRadius: PROFILE_PHOTO_SIZE / 2 }}
      />
    </View>
  );
}

/**
 * Botao central de destaque (estilo "Gravar" do Strava). NAO e uma aba: nao tem rota em <Tabs.Screen>, so abre a
 * tela Treinar (pilha raiz `/treinar`, menu retro de modalidades) e nunca fica "selecionado".
 */
function CenterTrainButton() {
  return (
    <View style={styles.centerSlot}>
      <Pressable
        onPress={() => router.push('/treinar')}
        accessibilityRole="button"
        accessibilityLabel="Treinar"
        hitSlop={4}
        style={({ pressed }) => [styles.centerButton, pressed && styles.centerButtonPressed]}
      >
        <Ionicons name="fitness" size={26} color={colors3.onPrimary} />
      </Pressable>
    </View>
  );
}

/**
 * Barra de tab totalmente customizada — arquitetura copiada do app Mizan
 * (mesmo usuario, referencia trazida por ele): em vez de configurar a
 * barra via `screenOptions.tabBarStyle` (confirmado nao aplicado — nem um
 * valor absurdo de margem/cor mudava algo visivel no device), o Mizan
 * desenha a barra do zero via `tabBar={(props) => <CustomTabBar {...props} />}`
 * no `<Tabs>`, com controle total sobre estilo/posicionamento sem
 * depender de nenhuma prop de estilo do React Navigation.
 *
 * `expo-glass-effect` (GlassView, Liquid Glass nativo da Apple) usado no
 * Mizan NAO esta instalado neste projeto (so `expo-blur`, confirmado em
 * package.json/package-lock.json) — e dependencia NATIVA nova, exigiria
 * build EAS (mesma regra de sempre: dependencia nativa = build, nao so
 * reload JS). Por pedido explicito, nao instalei — o fallback abaixo
 * (BlurView + tint, mesma tecnica ja usada em GlassCard/EditorialCard)
 * fica valendo por agora; Liquid Glass de verdade fica pra depois de um
 * build.
 *
 * Split shadowWrapper/barClip (diferente do Mizan, que aplica shadow +
 * overflow:hidden na MESMA view do container) — RN nao mostra shadow*
 * numa View que tambem tem overflow:'hidden' (o corte dos cantos
 * arredondados do blur exige overflow:hidden). GlassView (nativo) pode
 * nao sofrer dessa limitacao, mas nosso fallback usa BlurView + View
 * comuns, entao mantive o mesmo split ja usado em
 * GlassCard.tsx/LiquiglassCard.tsx pra sombra aparecer de verdade.
 */
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom + TAB_BAR_BOTTOM_GAP;

  return (
    <View
      style={[
        styles.shadowWrapper,
        { left: TAB_BAR_SIDE_MARGIN, right: TAB_BAR_SIDE_MARGIN, bottom, height: TAB_BAR_HEIGHT },
      ]}
    >
      <View style={styles.barClip}>
        <BlurView intensity={85} tint="light" style={StyleSheet.absoluteFillObject} />
        <View style={[StyleSheet.absoluteFillObject, styles.tint]} />
        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            // Mesma checagem que o Mizan usa (options.tabBarItemStyle?.display
            // === 'none') pra esconder um item da barra sem desregistrar a
            // rota — e como o expo-router marca por baixo dos panos o
            // `href: null` de Tabs.Screen (ver "profile" abaixo). Com barra
            // customizada, esconder deixa de ser automatico (so a barra
            // padrao do React Navigation faz isso sozinha) — precisa ser
            // checado manualmente aqui.
            if (options.tabBarItemStyle && (options.tabBarItemStyle as { display?: string }).display === 'none') {
              return null;
            }

            const isFocused = state.index === index;
            const color = isFocused ? ACTIVE_COLOR : INACTIVE_COLOR;

            const onPress = (_event: GestureResponderEvent) => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
            };

            return (
              <React.Fragment key={route.key}>
                <Pressable onPress={onPress} style={styles.tabBtn}>
                  {options.tabBarIcon?.({ color, focused: isFocused, size: TAB_ICON_SIZE })}
                  <Text style={[styles.label, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {options.title ?? route.name}
                  </Text>
                </Pressable>
                {/* Botao central entre Social (feed) e Refeicoes: ordem visivel = Home | Social | Treinar | Refeicoes | Perfil. */}
                {route.name === 'feed' && <CenterTrainButton />}
              </React.Fragment>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/**
 * Tab bar flutuante e translucida (vidro fosco) — margem lateral e
 * inferior (nao colada nas bordas), cantos em pill, fundo em blur claro
 * (mesmo tratamento visual do GlassCard/prism-glass da Home), sombra sutil
 * de elevacao. Ver CustomTabBar acima pro porque da mudanca de arquitetura
 * (tabBarStyle -> tabBar customizado).
 *
 * Abas visiveis: Home (index), Social (feed), Refeicoes (meals) e Perfil (profile, com a foto do usuario), mais o
 * botao central Treinar (nao e aba). Treino (workout), Ranking e Desafios continuam como rotas (href: null), nao
 * apagadas: o plano de treino abre pela Home/`/treinar`, o Ranking pelo trofeu do Social e Desafios pelo carrossel
 * da Home.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      {/* A rota continua `feed` (nao renomeada, para nao quebrar referencias); so o rotulo e "Social". */}
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Social',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="meals"
        options={{
          title: 'Refeições',
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" color={color} size={size} />,
        }}
      />
      {/* Perfil: 5a posicao, com a foto do usuario no lugar do icone (ver ProfileTabIcon). */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
      />
      {/*
        Rotas ocultas (href: null, nao desregistradas): Treino (plano de IA/do personal; acessivel pela Home,
        AiWorkoutCard e /treinar/[modalidade]), Ranking (ponte temporaria: trofeu no cabecalho do Social, ate o
        Social ganhar abas) e Desafios (carrossel da Home).
      */}
      <Tabs.Screen name="workout" options={{ href: null }} />
      <Tabs.Screen name="ranking" options={{ href: null }} />
      <Tabs.Screen name="challenges" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    position: 'absolute',
    borderRadius: TAB_BAR_RADIUS,
    // Sombra/elevacao EXATAS do Mizan (offset/opacity/radius/elevation) —
    // so a cor da sombra continua neutra (preto), o Mizan tambem usa
    // shadowColor:'#000' (a cor dourada dele so entra na borda/glass, nao
    // na sombra).
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
  barClip: {
    flex: 1,
    borderRadius: TAB_BAR_RADIUS,
    borderWidth: 1,
    // Roxo do Tryv com alpha .32 (subi de .25) — com o fundo mais
    // transparente (ver `tint` abaixo), a borda ganhou um pouco mais de
    // presenca pra continuar demarcando a barra sem depender da opacidade
    // do fundo (pedido explicito: compensar com borda/sombra, nao com o
    // tint). #6b38d4 (colors3.primary) = rgb(107,56,212).
    borderColor: 'rgba(107, 56, 212, 0.32)',
    overflow: 'hidden',
  },
  // Fundo do glass — opacidade reduzida (era .45, agora .32) + blur mais
  // forte (intensity 60->85 no BlurView acima) pra deixar ver de verdade o
  // conteudo passando por tras, em vez de parecer um fundo solido meio
  // esbranquicado. Ainda branco (coerente com o tema claro "prism-glass"
  // da Home), so mais translucido — pedido explicito de aproximar do
  // vidro de verdade do Mizan (GlassView/Liquid Glass nativo), que nao
  // temos instalado ainda (ver comentario no topo do arquivo).
  tint: { backgroundColor: 'rgba(255, 255, 255, 0.32)' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, paddingHorizontal: 1 },
  // Mesma largura de um item (flex: 1) para as 5 posicoes ficarem iguais; o circulo fica centrado e contido nos 60 pt.
  centerSlot: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  centerButton: {
    width: CENTER_BUTTON_SIZE,
    height: CENTER_BUTTON_SIZE,
    borderRadius: CENTER_BUTTON_SIZE / 2,
    backgroundColor: colors3.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: colors3.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  centerButtonPressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  profileRing: {
    width: PROFILE_RING_SIZE,
    height: PROFILE_RING_SIZE,
    borderRadius: PROFILE_RING_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
});
