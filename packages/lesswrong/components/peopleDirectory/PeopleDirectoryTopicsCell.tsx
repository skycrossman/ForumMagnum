import React, { useEffect, useRef } from "react";
import { Components, registerComponent } from "../../lib/vulcan-lib";
import { tagStyle, smallTagTextStyle, coreTagStyle } from "../tagging/FooterTag";
import { textCellStyles } from "./PeopleDirectoryTextCell";
import { InteractionWrapper } from "../common/useClickableCell";
import { tagGetUrl } from "@/lib/collections/tags/helpers";

const styles = (theme: ThemeType) => ({
  root: {
    display: "flex",
    rowGap: "2px",
    flexWrap: "wrap",
    overflow: "hidden",
    maxHeight: 42,
  },
  tagWrapper: {},
  tag: {
    ...tagStyle(theme),
    ...smallTagTextStyle(theme),
    ...coreTagStyle(theme),
  },
  more: {
    ...textCellStyles(theme),
    color: theme.palette.grey[600],
    marginTop: 2,
    marginLeft: 6,
  },
});

const TAG_COUNT = 3;

export const PeopleDirectoryTopicsCell = ({user, classes}: {
  user: SearchUser,
  classes: ClassesType<typeof styles>,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  // The kind of wrapping we want here can't be done with pure CSS unfortunately
  // since we want to show a "+ n more" message at the end after two lines of
  // tags. We do this by iterating over the tags after the initial render and
  // removing as many as needed until the "+ n more" message is visible.
  useEffect(() => {
    const container = ref.current;
    if (!container) {
      return;
    }

    const tags: HTMLElement[] = Array.from(
      container.querySelectorAll(`.${classes.tagWrapper}`),
    );
    for (const tag of tags) {
      tag.style.display = "block";
    }

    const more: HTMLElement | null = container.querySelector(`.${classes.more}`);
    if (!tags.length || !more) {
      return;
    }

    const offsets = Array.from(
      new Set(tags.map((t) => t.getBoundingClientRect().top)),
    ).sort();
    if (offsets.length < 2) {
      return;
    }
    while (more.getBoundingClientRect().top > offsets[1] + 15) {
      const tag = tags.pop();
      if (tag) {
        tag.remove();
      } else {
        break;
      }
    }
  }, [classes]);

  const {TagsTooltip, LWTooltip} = Components;
  return (
    <div className={classes.root} ref={ref}>
      {user.tagNames?.slice(0, TAG_COUNT).map((tagName) => {
        const slug = user.tags?.find(({name}) => name === tagName)?.slug;
        if (!slug) {
          return null;
        }
        return (
          <InteractionWrapper
            key={tagName}
            href={tagGetUrl({slug}, {from: "people_directory"})}
            openInNewTab
            className={classes.tagWrapper}
          >
            <TagsTooltip tagSlug={slug} hideRelatedTags>
              <div className={classes.tag}>
                {tagName}
              </div>
            </TagsTooltip>
          </InteractionWrapper>
        );
      })}
      {(user.tagNames?.length ?? 0) > TAG_COUNT &&
        <div className={classes.more}>
          <LWTooltip title={
            <div>
              {user.tagNames!.slice(TAG_COUNT).map((tag) => (
                <div key={tag}>{tag}</div>
              ))}
            </div>
          }>
            + {user.tagNames!.length - TAG_COUNT} more
          </LWTooltip>
        </div>
      }
    </div>
  );
}

const PeopleDirectoryTopicsCellComponent = registerComponent(
  "PeopleDirectoryTopicsCell",
  PeopleDirectoryTopicsCell,
  {styles},
);

declare global {
  interface ComponentTypes {
    PeopleDirectoryTopicsCell: typeof PeopleDirectoryTopicsCellComponent
  }
}
