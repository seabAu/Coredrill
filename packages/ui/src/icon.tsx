import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleHelp,
  Info,
  Search,
  Settings,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

export const UI_ICON_NAMES = Object.freeze([
  "alert-triangle",
  "check",
  "chevron-right",
  "help",
  "info",
  "search",
  "settings",
  "x",
] as const);
export type UiIconName = (typeof UI_ICON_NAMES)[number];

const ICONS: Readonly<Record<UiIconName, LucideIcon>> = Object.freeze({
  "alert-triangle": AlertTriangle,
  check: Check,
  "chevron-right": ChevronRight,
  help: CircleHelp,
  info: Info,
  search: Search,
  settings: Settings,
  x: X,
});

type SafeLucideProps = Omit<
  LucideProps,
  "aria-hidden" | "aria-label" | "children" | "focusable" | "role"
>;

interface IconBaseProps extends SafeLucideProps {
  readonly name: UiIconName;
}

interface SemanticIconProps extends IconBaseProps {
  readonly decorative?: false;
  readonly label: string;
}

interface DecorativeIconProps extends IconBaseProps {
  readonly decorative: true;
  readonly label?: never;
}

export type IconProps = SemanticIconProps | DecorativeIconProps;

export const Icon = (props: IconProps) => {
  if (props.decorative === true) {
    const { decorative, name, ...iconProps } = props;
    void decorative;
    const IconComponent = ICONS[name];
    return (
      <IconComponent
        {...iconProps}
        aria-hidden
        className={["cd-icon", iconProps.className].filter(Boolean).join(" ")}
        focusable="false"
        strokeWidth={iconProps.strokeWidth ?? 1.75}
      />
    );
  }

  const { decorative, label, name, ...iconProps } = props;
  void decorative;
  const runtimeLabel: unknown = label;
  if (typeof runtimeLabel !== "string" || runtimeLabel.trim().length === 0) {
    throw new TypeError("Semantic icons require a nonempty accessible label.");
  }
  const IconComponent = ICONS[name];
  return (
    <IconComponent
      {...iconProps}
      aria-label={runtimeLabel}
      className={["cd-icon", iconProps.className].filter(Boolean).join(" ")}
      focusable="false"
      role="img"
      strokeWidth={iconProps.strokeWidth ?? 1.75}
    />
  );
};
