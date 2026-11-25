import type { PluginTheme } from "@getpaseo/plugin";
import { useTranslation } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  type PressableStateCallbackType,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { Heading } from "./document";
import { messages } from "./messages";

const MONO = Platform.select({
  web: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  ios: "Menlo",
  default: "monospace",
});
const INDENT = 14;
const CHEVRON = 18;
const CONTENT_PADDING = 6;

interface OutlineTreeProps {
  headings: Heading[];
  active: number;
  collapsed: ReadonlySet<number>;
  theme: PluginTheme;
  onSelect(index: number): void;
  onToggle(index: number): void;
}

/** The heading tree: indented by level, collapsible like a file tree, active row kept in view. */
export function OutlineTree({ headings, active, collapsed, theme, onSelect, onToggle }: OutlineTreeProps) {
  const { t } = useTranslation(messages);
  const styles = useMemo(() => treeStyles(theme), [theme]);
  const minLevel = useMemo(() => Math.min(7, ...headings.map((heading) => heading.level)), [headings]);
  const visible = useMemo(() => visibleHeadings(headings, collapsed), [headings, collapsed]);

  const scroll = useRef<ScrollView>(null);
  // Row heights, not positions: react-native-web reports onLayout only when a view resizes.
  const rowHeights = useRef(new Map<number, number>());
  const viewport = useRef({ y: 0, height: 0 });
  const onRowLayout = useCallback((index: number, height: number) => rowHeights.current.set(index, height), []);

  useEffect(() => {
    const { y, height } = viewport.current;
    let top = CONTENT_PADDING;
    for (const { heading } of visible) {
      const rowHeight = rowHeights.current.get(heading.index) ?? 0;
      if (heading.index === active) {
        if (height > 0 && (top < y || top + rowHeight > y + height)) {
          scroll.current?.scrollTo({ y: Math.max(0, top - height / 3), animated: true });
        }
        return;
      }
      top += rowHeight;
    }
  }, [active, visible]);

  if (headings.length === 0) {
    return <Text style={styles.empty}>{t("empty")}</Text>;
  }

  return (
    <ScrollView
      ref={scroll}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      scrollEventThrottle={32}
      onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
        viewport.current.y = event.nativeEvent.contentOffset.y;
      }}
      onLayout={(event: LayoutChangeEvent) => {
        viewport.current.height = event.nativeEvent.layout.height;
      }}
    >
      {visible.map(({ heading, hasChildren }) => (
        <OutlineRow
          key={heading.index}
          heading={heading}
          depth={heading.level - minLevel}
          hasChildren={hasChildren}
          isCollapsed={collapsed.has(heading.index)}
          isActive={heading.index === active}
          styles={styles}
          toggleLabel={t("toggleSection", { title: heading.title })}
          onSelect={onSelect}
          onToggle={onToggle}
          onRowLayout={onRowLayout}
        />
      ))}
    </ScrollView>
  );
}

interface OutlineRowProps {
  heading: Heading;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  isActive: boolean;
  styles: ReturnType<typeof treeStyles>;
  toggleLabel: string;
  onSelect(index: number): void;
  onToggle(index: number): void;
  onRowLayout(index: number, height: number): void;
}

const OutlineRow = memo(function OutlineRow({
  heading,
  depth,
  hasChildren,
  isCollapsed,
  isActive,
  styles,
  toggleLabel,
  onSelect,
  onToggle,
  onRowLayout,
}: OutlineRowProps) {
  return (
    <View
      style={[styles.row, { paddingLeft: 6 + depth * INDENT }]}
      onLayout={(event) => onRowLayout(heading.index, event.nativeEvent.layout.height)}
    >
      {hasChildren ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          accessibilityState={{ expanded: !isCollapsed }}
          hitSlop={6}
          style={styles.chevron}
          onPress={() => onToggle(heading.index)}
        >
          <Icon name={isCollapsed ? "ChevronRight" : "ChevronDown"} size={14} color={styles.muted.color} />
        </Pressable>
      ) : (
        <View style={styles.chevron} />
      )}
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ selected: isActive }}
        style={(state) => [styles.title, isActive && styles.activeTitle, hovered(state) && !isActive && styles.hoverTitle]}
        onPress={() => onSelect(heading.index)}
      >
        <Text style={[styles.text, isActive && styles.activeText]}>
          {heading.spans.map((span, i) =>
            span.code ? (
              <Text key={i} style={styles.code}>
                {span.text}
              </Text>
            ) : (
              span.text
            ),
          )}
        </Text>
      </Pressable>
    </View>
  );
});

/** react-native-web adds `hovered` to the Pressable state. */
function hovered(state: PressableStateCallbackType): boolean {
  return (state as PressableStateCallbackType & { hovered?: boolean }).hovered === true;
}

export function visibleHeadings(headings: Heading[], collapsed: ReadonlySet<number>) {
  const out: { heading: Heading; hasChildren: boolean }[] = [];
  let hideBelow = Infinity;
  headings.forEach((heading, i) => {
    if (heading.level > hideBelow) return;
    hideBelow = collapsed.has(i) ? heading.level : Infinity;
    out.push({ heading, hasChildren: (headings[i + 1]?.level ?? 0) > heading.level });
  });
  return out;
}

function treeStyles(theme: PluginTheme) {
  const { colors } = theme;
  return {
    scroll: { flex: 1 },
    content: { paddingVertical: CONTENT_PADDING, paddingRight: 8 },
    empty: { color: colors.foregroundMuted, padding: 16, fontSize: 13 },
    row: { flexDirection: "row" as const, alignItems: "flex-start" as const },
    chevron: { width: CHEVRON, height: 28, alignItems: "center" as const, justifyContent: "center" as const },
    title: { flex: 1, borderRadius: 4, paddingVertical: 5, paddingHorizontal: 6 },
    hoverTitle: { backgroundColor: colors.surface2 },
    activeTitle: { backgroundColor: colors.surface2 },
    text: { color: colors.foregroundMuted, fontSize: 13, lineHeight: 18 },
    activeText: { color: colors.foreground, fontWeight: "600" as const },
    code: {
      fontFamily: MONO,
      fontSize: 12,
      color: colors.foreground,
      backgroundColor: colors.surface0,
      borderRadius: 3,
    },
    muted: { color: colors.foregroundMuted },
  };
}
