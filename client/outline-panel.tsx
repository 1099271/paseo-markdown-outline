import {
  type PluginFilePanelProps,
  useFileText,
  useSettings,
  useTranslation,
} from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Loading, Markdown } from "@getpaseo/plugin/client/ui";
import { memo, type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { OUTLINE_WIDTHS, outlinePreferences } from "../shared/preferences";
import { type MarkdownDocument, parseMarkdownDocument } from "./document";
import { messages } from "./messages";
import { OutlineTree } from "./outline-tree";

interface Prefs {
  side: "left" | "right";
  visible: boolean;
  width: keyof typeof OUTLINE_WIDTHS;
}
const DEFAULTS: Prefs = { side: "left", visible: true, width: "normal" };
const CONTENT_PADDING = 16;
/** A heading counts as current once it is this close to the top of the view. */
const ACTIVE_SLOP = 24;
/** Scroll events from a jump arrive after it starts; keep the clicked heading active meanwhile. */
const JUMP_HOLD_MS = 800;

export function OutlinePanel({ file, theme, layout }: PluginFilePanelProps) {
  const { t } = useTranslation(messages);
  const text = useFileText(file);
  const settings = useSettings(outlinePreferences);
  const prefs = settings.status === "ready" ? settings.values : DEFAULTS;
  const source = text.status === "ready" ? text.text : null;
  const doc = useMemo(() => (source === null ? null : parseMarkdownDocument(source, file.path)), [source, file.path]);
  const styles = useMemo(() => panelStyles(theme, layout.compact), [theme, layout.compact]);

  const [compactOpen, setCompactOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());
  const [active, setActive] = useState(-1);
  const content = useRef<ScrollView>(null);
  const blockHeights = useRef<number[]>([]);
  const jumpUntil = useRef(0);

  const save = (patch: Partial<Prefs>) => {
    if (settings.status === "ready") void settings.save({ ...settings.values, ...patch }, settings.revision);
  };

  // Block 0 is front matter (possibly empty); block k + 1 is section k.
  const headingBlocks = useMemo(() => {
    const blocks: number[] = [];
    doc?.sections.forEach((section, k) => {
      if (section.heading) blocks[section.heading.index] = k + 1;
    });
    return blocks;
  }, [doc]);

  // Offsets come from summed heights: react-native-web only reports onLayout when a view resizes.
  const offsetOfBlock = useCallback((block: number) => {
    let y = CONTENT_PADDING;
    for (let k = 0; k < block; k++) y += blockHeights.current[k] ?? 0;
    return y;
  }, []);

  const onBlockLayout = useCallback((block: number, height: number) => {
    blockHeights.current[block] = height;
  }, []);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (Date.now() < jumpUntil.current) return;
      const y = event.nativeEvent.contentOffset.y + ACTIVE_SLOP;
      let current = -1;
      let top = CONTENT_PADDING;
      let block = 0;
      for (let i = 0; i < headingBlocks.length; i++) {
        for (; block < headingBlocks[i]!; block++) top += blockHeights.current[block] ?? 0;
        if (top > y) break;
        current = i;
      }
      setActive(current);
    },
    [headingBlocks],
  );

  const select = useCallback(
    (index: number) => {
      const block = headingBlocks[index];
      if (block === undefined) return;
      jumpUntil.current = Date.now() + JUMP_HOLD_MS;
      setActive(index);
      setCompactOpen(false);
      content.current?.scrollTo({ y: offsetOfBlock(block), animated: true });
    },
    [headingBlocks, offsetOfBlock],
  );

  const toggle = useCallback((index: number) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  }, []);

  if (text.status === "loading" || !doc) {
    return text.status === "error" ? <Text style={styles.error}>{text.error.message}</Text> : <Loading />;
  }

  const parents = doc.headings.filter((heading, i) => (doc.headings[i + 1]?.level ?? 0) > heading.level);
  const allCollapsed = parents.length > 0 && parents.every((heading) => collapsed.has(heading.index));
  const showOutline = layout.compact ? compactOpen : prefs.visible;
  const onLeft = prefs.side === "left";

  const outline = (
    <View
      style={[
        styles.outline,
        layout.compact ? styles.outlineOverlay : { width: OUTLINE_WIDTHS[prefs.width] },
        !layout.compact && (onLeft ? styles.outlineLeft : styles.outlineRight),
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("outline")}</Text>
        {parents.length > 0 ? (
          <HeaderButton
            icon={allCollapsed ? "ChevronsUpDown" : "ChevronsDownUp"}
            label={t(allCollapsed ? "expandAll" : "collapseAll")}
            color={theme.colors.foregroundMuted}
            onPress={() => setCollapsed(allCollapsed ? new Set() : new Set(parents.map((heading) => heading.index)))}
          />
        ) : null}
        {layout.compact ? null : (
          <HeaderButton
            icon="ArrowLeftRight"
            label={t(onLeft ? "moveRight" : "moveLeft")}
            color={theme.colors.foregroundMuted}
            onPress={() => save({ side: onLeft ? "right" : "left" })}
          />
        )}
        <HeaderButton
          icon={layout.compact ? "X" : onLeft ? "PanelLeftClose" : "PanelRightClose"}
          label={t("hideOutline")}
          color={theme.colors.foregroundMuted}
          onPress={() => (layout.compact ? setCompactOpen(false) : save({ visible: false }))}
        />
      </View>
      <OutlineTree
        headings={doc.headings}
        active={active}
        collapsed={collapsed}
        theme={theme}
        onSelect={select}
        onToggle={toggle}
      />
    </View>
  );

  return (
    <View style={[styles.root, { flexDirection: onLeft || layout.compact ? "row" : "row-reverse" }]}>
      {showOutline && !layout.compact ? outline : null}
      <View style={styles.main}>
        <ScrollView
          ref={content}
          style={styles.main}
          contentContainerStyle={styles.content}
          scrollEventThrottle={32}
          onScroll={onScroll}
        >
          <DocumentBlocks doc={doc} theme={theme} styles={styles} onBlockLayout={onBlockLayout} />
        </ScrollView>
        {showOutline ? null : (
          <View style={[styles.reveal, layout.compact || !onLeft ? styles.revealRight : styles.revealLeft]}>
            <HeaderButton
              icon={layout.compact ? "ListTree" : onLeft ? "PanelLeftOpen" : "PanelRightOpen"}
              label={t("showOutline")}
              color={theme.colors.foregroundMuted}
              onPress={() => (layout.compact ? setCompactOpen(true) : save({ visible: true }))}
            />
          </View>
        )}
      </View>
      {showOutline && layout.compact ? outline : null}
    </View>
  );
}

const DocumentBlocks = memo(function DocumentBlocks({
  doc,
  theme,
  styles,
  onBlockLayout,
}: {
  doc: MarkdownDocument;
  theme: PluginTheme;
  styles: ReturnType<typeof panelStyles>;
  onBlockLayout(block: number, height: number): void;
}) {
  return (
    <>
      <Block block={0} style={styles.block} onBlockLayout={onBlockLayout}>
        {doc.frontMatter.length > 0 ? <FrontMatter rows={doc.frontMatter} theme={theme} /> : null}
      </Block>
      {doc.sections.map((section, k) => (
        <Block key={k} block={k + 1} style={styles.block} onBlockLayout={onBlockLayout}>
          <SectionMarkdown markdown={section.markdown} />
        </Block>
      ))}
    </>
  );
});

function Block({
  block,
  style,
  onBlockLayout,
  children,
}: {
  block: number;
  style: object;
  onBlockLayout(block: number, height: number): void;
  children: ReactNode;
}) {
  return (
    <View style={style} onLayout={(event: LayoutChangeEvent) => onBlockLayout(block, event.nativeEvent.layout.height)}>
      {children}
    </View>
  );
}

/** Memoized per section so an edit on disk re-renders only the sections it touched. */
const SectionMarkdown = memo(function SectionMarkdown({ markdown }: { markdown: string }) {
  return <Markdown>{markdown}</Markdown>;
});

function FrontMatter({ rows, theme }: { rows: [string, string][]; theme: PluginTheme }) {
  const { colors } = theme;
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, marginBottom: 16 }}>
      {rows.map(([key, value], i) => (
        <View
          key={`${key}:${i}`}
          style={{ flexDirection: "row", borderTopWidth: i > 0 ? 1 : 0, borderColor: colors.border }}
        >
          <Text selectable style={{ width: 140, padding: 8, color: colors.foregroundMuted, fontSize: 13 }}>
            {key}
          </Text>
          <Text selectable style={{ flex: 1, padding: 8, color: colors.foreground, fontSize: 13 }}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function HeaderButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  color: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      // Tooltip on web; react-native-web maps `title` through to the element.
      {...({ title: label } as object)}
      hitSlop={6}
      onPress={onPress}
      style={{ padding: 5, borderRadius: 4 }}
    >
      <Icon name={icon} size={15} color={color} />
    </Pressable>
  );
}

function panelStyles(theme: PluginTheme, compact: boolean) {
  const { colors } = theme;
  return {
    root: { flex: 1, backgroundColor: colors.surface0 },
    main: { flex: 1, minWidth: 0 },
    content: { paddingVertical: CONTENT_PADDING, paddingHorizontal: compact ? 12 : 28 },
    block: { width: "100%" as const, maxWidth: 860, alignSelf: "center" as const },
    error: { color: colors.statusDanger, padding: 16 },
    outline: { backgroundColor: colors.surface1, borderColor: colors.border },
    outlineLeft: { borderRightWidth: 1 },
    outlineRight: { borderLeftWidth: 1 },
    outlineOverlay: { position: "absolute" as const, top: 0, bottom: 0, left: 0, right: 0 },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
      paddingLeft: 12,
      paddingRight: 6,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    headerTitle: { flex: 1, color: colors.foreground, fontSize: 13, fontWeight: "600" as const },
    reveal: {
      position: "absolute" as const,
      top: 8,
      backgroundColor: colors.surface1,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 6,
    },
    revealLeft: { left: 8 },
    revealRight: { right: 8 },
  };
}
