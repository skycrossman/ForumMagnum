import React, { FC, ReactElement, MouseEvent } from "react";
import { registerComponent, Components } from "../../lib/vulcan-lib";
import { ForumIconName } from "../common/ForumIcon";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import { Link } from "../../lib/reactRouterWrapper";
import type { HashLinkProps } from "../common/HashLink";
import { isEAForum } from "../../lib/instanceSettings";

const styles = (theme: ThemeType): JssStyles => ({
  root: {
    ...(isEAForum && {
    }),
  },
  title: {
    flexGrow: 1,
  },
  afterIcon: {
    fontSize: 20,
    marginLeft: 4,
  },
  sideMessage: {
    position: "absolute",
    right: 12,
    top: 12,
    color: theme.palette.text.dim40,
    [theme.breakpoints.down("xs")]: {
      display: "none",
    },
  },
  tooltip: {
    display: "block",
  },
});

export type DropdownItemAction = {
  onClick: (event: MouseEvent) => void | Promise<void>,
  to?: never,
} | {
  onClick?: never,
  to: HashLinkProps["to"],
}

export type DropdownItemProps = DropdownItemAction & {
  title: string,
  sideMessage?: string,
  icon?: ForumIconName | (() => ReactElement),
  afterIcon?: ForumIconName,
  tooltip?: string,
  disabled?: boolean,
  loading?: boolean,
}

const DummyWrapper: FC = ({children}) => <>{children}</>;

const DropdownItem = ({
  title,
  sideMessage,
  onClick,
  to,
  icon,
  afterIcon,
  tooltip,
  disabled,
  loading,
  classes,
}: DropdownItemProps & {classes: ClassesType}) => {
  const {MenuItem, Loading, ForumIcon, LWTooltip} = Components;
  const LinkWrapper = to ? Link : DummyWrapper;
  const TooltipWrapper = tooltip ? LWTooltip : DummyWrapper;
  return (
    <LinkWrapper to={to!}>
      <TooltipWrapper title={tooltip!} className={classes.tooltip}>
        <MenuItem
          onClick={onClick}
          disabled={disabled}
          className={classes.root}
        >
          {loading &&
            <ListItemIcon>
              <Loading />
            </ListItemIcon>
          }
          {icon && !loading &&
            <ListItemIcon>
              {typeof icon === "string"
                ? <ForumIcon icon={icon} />
                : icon()
              }
            </ListItemIcon>
          }
          <span className={classes.title}>{title}</span>
          {afterIcon &&
            <ForumIcon icon={afterIcon} className={classes.afterIcon} />
          }
          {sideMessage &&
            <div className={classes.sideMessage}>
              {sideMessage}
            </div>
          }
        </MenuItem>
      </TooltipWrapper>
    </LinkWrapper>
  );
}

const DropdownItemComponent = registerComponent(
  "DropdownItem",
  DropdownItem,
  {styles},
);

declare global {
  interface ComponentTypes {
    DropdownItem: typeof DropdownItemComponent
  }
}
