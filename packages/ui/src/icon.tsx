import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudOff,
  Command,
  Database,
  FilePlus2,
  Files,
  FileUp,
  Handshake,
  HardDriveDownload,
  House,
  Info,
  Menu,
  Plus,
  Search,
  Settings,
  UserRound,
  UserRoundPlus,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

export const UI_ICON_NAMES = Object.freeze([
  "alert-triangle",
  "chart",
  "briefcase",
  "building",
  "check",
  "chevron-down",
  "chevron-right",
  "cloud-off",
  "command",
  "database",
  "file-plus",
  "files",
  "file-up",
  "handshake",
  "hard-drive-download",
  "help",
  "home",
  "info",
  "menu",
  "plus",
  "search",
  "settings",
  "user",
  "user-plus",
  "x",
] as const);
export type UiIconName = (typeof UI_ICON_NAMES)[number];

const ICONS: Readonly<Record<UiIconName, LucideIcon>> = Object.freeze({
  "alert-triangle": AlertTriangle,
  briefcase: BriefcaseBusiness,
  building: Building2,
  chart: BarChart3,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "cloud-off": CloudOff,
  command: Command,
  database: Database,
  "file-plus": FilePlus2,
  files: Files,
  "file-up": FileUp,
  handshake: Handshake,
  "hard-drive-download": HardDriveDownload,
  help: CircleHelp,
  home: House,
  info: Info,
  menu: Menu,
  plus: Plus,
  search: Search,
  settings: Settings,
  user: UserRound,
  "user-plus": UserRoundPlus,
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
