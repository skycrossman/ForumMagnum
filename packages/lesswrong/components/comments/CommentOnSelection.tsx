import React, { useEffect, useState, useRef } from 'react';
import { Components, registerComponent } from '../../lib/vulcan-lib/components';
import CommentIcon from '@material-ui/icons/ModeComment';
import { userHasCommentOnSelection } from '../../lib/betas';
import { useCurrentUser } from '../common/withUser';
import { useOnNavigate } from '../hooks/useOnNavigate';
import { isEAForum } from '../../lib/instanceSettings';

const selectedTextToolbarStyles = (theme: ThemeType): JssStyles => ({
  toolbar: {
    background: theme.palette.panelBackground.darken03,
    borderRadius: 8,
    color: theme.palette.icon.dim,
    position: "absolute",
    zIndex: theme.zIndexes.lwPopper,
    padding: 8,
    cursor: "pointer",
    
    "&:hover": {
      background: theme.palette.panelBackground.darken08,
    },

    // Hide on mobile to avoid horizontal scrolling
    [theme.breakpoints.down('xs')]: {
      display: isEAForum ? "none" : "initial",
    },
  },
});

type SelectedTextToolbarState =
    {open: false}
  | {open: true, x: number, y: number}

/**
 * CommentOnSelectionPageWrapper: Wrapper around the entire page (used in
 * Layout) which adds event handlers to text-selection. If the selected range is
 * entirely wrapped in a CommentOnSelectionWrapper (in practice: is a post-body
 * on a post-page), places a floating comment button in the margin to the right.
 * When clicked, takes the selected content (HTML), wraps it in <blockquote>,
 * and calls the onClickComment function that was passed to the
 * CommentOnSelectionWrapper. (That function, defined as part of PostsPage,
 * opens a floating comment editor prepopulated with the blockquote.)
 *
 * The CommentOnSelectionWrapper is found by walking up the DOM until we find
 * an HTML element with onClickComment monkeypatched onto it. Placement of the
 * toolbar button is done with coordinate-math.
 *
 * Positioning might be brittle if the element that supports selection is nested
 * with multiple scrollbars or certain complex positioning. Test each context
 * separately when adding `CommentOnSelectionContentWrapper`s.
 *
 * If there's no space in the right margin (eg on mobile), adding the button
 * might introduce horizontal scrolling.
 */
const CommentOnSelectionPageWrapper = ({children}: {
  children: React.ReactNode
}) => {
  const { SelectedTextToolbar } = Components;
  const [toolbarState,setToolbarState] = useState<SelectedTextToolbarState>({open: false});
 
  useEffect(() => {
    const selectionChangedHandler = () => {
      const selection = document.getSelection();
      const selectionText = selection+"";
      
      // Is this selection non-empty?
      if (!selection || !selectionText?.length) {
        setToolbarState({open: false});
        return;
      }
      
      // Determine whether this selection is fully wrapped in a single CommentOnSelectionContentWrapper
      let commonWrapper: HTMLElement|null = null;
      let hasCommonWrapper = true;
      for (let i=0; i<selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        const container = range.commonAncestorContainer;
        const wrapper = findAncestorElementWithCommentOnSelectionWrapper(container);
        if (commonWrapper) {
          if (container !== commonWrapper) {
            hasCommonWrapper = false;
          }
        } else {
          commonWrapper = wrapper;
        }
      }
      
      if (!commonWrapper || !hasCommonWrapper) {
        setToolbarState({open: false});
        return;
      }
      
      // Get the bounding box of the selection
      const selectionBoundingRect = selection.getRangeAt(0).getBoundingClientRect();
      const wrapperBoundingRect = commonWrapper.getBoundingClientRect();
      
      // Place the toolbar
      const x = window.scrollX + Math.max(
        selectionBoundingRect.x + selectionBoundingRect.width,
        wrapperBoundingRect.x + wrapperBoundingRect.width);
      const y = selectionBoundingRect.y + window.scrollY;
      setToolbarState({open: true, x,y});
    };
    document.addEventListener('selectionchange', selectionChangedHandler);
    
    return () => {
      document.removeEventListener('selectionchange', selectionChangedHandler);
    };
  }, []);
  
  useOnNavigate(() => {
    setToolbarState({open: false});
  });
  
  const onClickComment = () => {
    const firstSelectedNode = document.getSelection()?.anchorNode;
    if (!firstSelectedNode) {
      return;
    }
    const contentWrapper = findAncestorElementWithCommentOnSelectionWrapper(firstSelectedNode);
    if (!contentWrapper) {
      return;
    }
    const selectionHtml = selectionToBlockquoteHTML(document.getSelection());
    // This HTML is XSS-safe because it's copied from somewhere that was already in the page as HTML, and is copied in a way that is syntax-aware throughout.
    (contentWrapper as any).onClickComment(selectionHtml);
  }
  
  return <>
    {children}
    {toolbarState.open && <SelectedTextToolbar
      onClickComment={onClickComment}
      x={toolbarState.x} y={toolbarState.y}
    />}
  </>
}

/**
 * SelectedTextToolbar: The toolbar that pops up when you select content inside
 * a post. Consists of just a comment button, which opens a floating comment
 * editor. Created as a dialog by CommentOnSelectionPageWrapper.
 *
 * onClickComment: Called when the comment button is clicked
 * x, y: In the page coordinate system, ie, relative to the top-left corner when
 *   the page is scrolled to the top.
 */
const SelectedTextToolbar = ({onClickComment, x, y, classes}: {
  onClickComment: (ev: React.MouseEvent)=>void,
  x: number, y: number,
  classes: ClassesType,
}) => {
  return <div className={classes.toolbar} style={{left: x, top: y}}>
    <CommentIcon onClick={ev => onClickComment(ev)}/>
  </div>
}


/**
 * CommentOnSelectionContentWrapper: Marks the contents inside it so that when
 * you highlight text, a floating comment button appears in the right margin.
 * When that button is clicked, calls onClickComment with the selected content,
 * wrapped in <blockquote>.
 *
 * See CommentOnSelectionPageWrapper for notes on implementation details.
 */
const CommentOnSelectionContentWrapper = ({onClickComment, children}: {
  onClickComment: (html: string)=>void,
  children: React.ReactNode,
}) => {
  const wrapperDivRef = useRef<HTMLDivElement|null>(null);
  const currentUser = useCurrentUser();
  
  useEffect(() => {
    if (wrapperDivRef.current) {
      let modifiedDiv = (wrapperDivRef.current as any)
      modifiedDiv.onClickComment = onClickComment;
      
      return () => {
        modifiedDiv.onClickComment = null;
      }
    }
  }, [onClickComment]);
  
  if (!userHasCommentOnSelection(currentUser)) {
    return <>{children}</>;
  }
  
  return <div className="commentOnSelection" ref={wrapperDivRef}>
    {children}
  </div>
}

/**
 * Starting from an HTML node, climb the tree until one is found which matches
 * the given function. Returns the deepest matching element, or null if no
 * match.
 *
 * Client-side only.
 */
function nearestAncestorElementWith(start: Node|null, fn: (node: HTMLElement)=>boolean): HTMLElement|null {
  if (!start)
    return null;
  
  let pos: HTMLElement|null = start.parentElement;
  while(pos && !fn(pos)) {
    pos = pos.parentElement;
  }
  return pos;
}

/**
 * Starting from an HTML node, climb the tree until one is found which
 * corresponds to a CommentOnSelectionContentWrapper component, ie, one with an
 * onClickComment function attached.
 *
 * Client-side only.
 */
function findAncestorElementWithCommentOnSelectionWrapper(start: Node): HTMLElement|null {
  return nearestAncestorElementWith(
    start,
    n=>!!((n as any).onClickComment)
  );
}

/**
 * selectionToBlockquoteHTML: Given a selection (this is a browser API, returned
 * from document.getSelection()), return the selected content, wrapped in a
 * blockquote. The resulting HTML is XSS-safe because it was already present in
 * the document as HTML.
 *
 * Client-side only.
 */
function selectionToBlockquoteHTML(selection: Selection|null): string {
  if (!selection || !selection.rangeCount)
    return "";
  
  var container = document.createElement("div");
  for (let i=0; i<selection.rangeCount; i++) {
    container.appendChild(selection.getRangeAt(i).cloneContents());
  }
  const selectedHTML = container.innerHTML;
  return `<blockquote>${selectedHTML}</blockquote><p></p>`;
}


const CommentOnSelectionPageWrapperComponent = registerComponent('CommentOnSelectionPageWrapper', CommentOnSelectionPageWrapper);
const SelectedTextToolbarComponent = registerComponent(
  'SelectedTextToolbar', SelectedTextToolbar,
  {styles: selectedTextToolbarStyles}
);
const CommentOnSelectionContentWrapperComponent = registerComponent("CommentOnSelectionContentWrapper", CommentOnSelectionContentWrapper);

declare global {
  interface ComponentTypes {
    CommentOnSelectionPageWrapper: typeof CommentOnSelectionPageWrapperComponent
    SelectedTextToolbar: typeof SelectedTextToolbarComponent
    CommentOnSelectionContentWrapper: typeof CommentOnSelectionContentWrapperComponent,
  }
}
