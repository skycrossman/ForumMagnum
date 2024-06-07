import React from 'react';
import { Components, registerComponent } from '../../lib/vulcan-lib';
import classNames from 'classnames';
import { isFriendlyUI } from '../../themes/forumTheme';

const styles = (theme: ThemeType): JssStyles => ({
  icon: {
    cursor: "pointer",
    color: theme.palette.grey[600],
    fontSize: 18
  },
  iconWithLabelGroup: {
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
  },
  iconWithLabel: {
    marginRight: 4,
    marginLeft: 4,
  },
  label: {
    ...theme.typography.body2,
    fontSize: 14,
    color: theme.palette.grey[600],
    ...(isFriendlyUI ? {fontWeight: 600} : {}),
  },
  blackLabel: {
    color: theme.palette.text.primary,
  },
  whiteLabel: {
    [theme.breakpoints.up('lg')]: {
      color: theme.palette.text.alwaysWhite
    }
  },
  textShadow: {
    color: theme.palette.text.primary,
    textShadow: `0 0 2px ${theme.palette.text.invertedBackgroundText}`
  },
  rotate180: {
   transform: "rotate(180deg)" 
  }
})

const SettingsButton = ({classes, className, onClick, showIcon=true, label="", useArrow, textShadow = false}: {
  classes: ClassesType,
  className?: string,
  onClick?: any,
  label?: string,
  showIcon?: boolean,
  useArrow?: 'up' | 'down'
  textShadow?: boolean
}) => {

  const { ForumIcon } = Components

  const iconType = !!useArrow ? "ThickChevronDown" : "Settings"

  if (label) {
    return <span className={classNames(classes.iconWithLabelGroup, className)} onClick={onClick}>
      {showIcon && <ForumIcon icon={iconType} className={classNames(classes.icon, classes.iconWithLabel, {[classes.rotate180]: useChevron==='up'})}/>}
      <span className={classNames(classes.label, {[classes.textShadow]: textShadow})}>{ label }</span>
    </span>
  }
  return <ForumIcon icon={iconType} className={classNames(classes.icon, className, {[classes.rotate180]: useChevron==='up'})} onClick={onClick}/>
}

const SettingsButtonComponent = registerComponent('SettingsButton', SettingsButton, {
  styles,
  stylePriority: -1,
});

declare global {
  interface ComponentTypes {
    SettingsButton: typeof SettingsButtonComponent
  }
}
