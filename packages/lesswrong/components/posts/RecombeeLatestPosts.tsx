import React, { useEffect, useState } from 'react';
import { AnalyticsContext, useTracking } from '../../lib/analyticsEvents';
import { EA_FORUM_TRANSLATION_TOPIC_ID } from '../../lib/collections/tags/collection';
import { RecombeeConfiguration } from '../../lib/collections/users/recommendationSettings';
import { FilterSettings, useFilterSettings } from '../../lib/filterSettings';
import { isEAForum, isLW, isLWorAF } from '../../lib/instanceSettings';
import moment from '../../lib/moment-timezone';
import { postFeedsProductionSetting, postFeedsTestingSetting } from '../../lib/publicSettings';
import { Link } from '../../lib/reactRouterWrapper';
import { reviewIsActive } from '../../lib/reviewUtils';
import { useLocation } from '../../lib/routeUtil';
import { frontpageDaysAgoCutoffSetting } from '../../lib/scoring';
import { useCurrentTime } from '../../lib/utils/timeUtil';
import { Components, registerComponent } from '../../lib/vulcan-lib';
import { userIsAdmin } from '../../lib/vulcan-users/permissions';
import { isFriendlyUI } from '../../themes/forumTheme';
import { sectionTitleStyle } from '../common/SectionTitle';
import { useTimezone } from '../common/withTimezone';
import { AllowHidingFrontPagePostsContext } from '../dropdowns/posts/PostActions';
import { HideRepeatedPostsProvider } from '../posts/HideRepeatedPostsContext';

import classNames from 'classnames';
import { useCookiesWithConsent } from '../hooks/useCookiesWithConsent';
import { RECOMBEE_SETTINGS_COOKIE } from '../../lib/cookies/cookies';
import { filterSettingsToggleLabels } from '../common/HomeLatestPosts';
import { useUpdateCurrentUser } from '../hooks/useUpdateCurrentUser';
import { TabRecord } from '../common/TabPicker';
import { useContinueReading } from '../recommendations/withContinueReading';
import { useMulti } from '../../lib/crud/withMulti';

// Key is the algorithm/scenario name
type RecombeeCookieSettings = [string, RecombeeConfiguration][];

const titleWrapper = isLWorAF ? {
  marginBottom: 8
} : {
  display: "flex",
  marginBottom: 8,
  flexWrap: "wrap",
  alignItems: "center"
};

const styles = (theme: ThemeType) => ({
  titleWrapper,
  title: {
    ...sectionTitleStyle(theme),
    display: "inline",
    marginRight: "auto"
  },
  toggleFilters: {
    [theme.breakpoints.up('sm')]: {
      display: "none"
    },
  },
  hide: {
      display: "none"
  },
  hideOnMobile: {
    [theme.breakpoints.down('sm')]: {
      display: "none"
    },
  },
  hideOnDesktop: {
    [theme.breakpoints.up('md')]: {
      display: "none"
    },
  },
  settingsVisibilityControls: {
    display: "flex",
    gap: "4px",
    marginBottom: "8px",
    justifyContent: "space-between",
    alignItems: "center",
  },
})

const advancedSortingText = isFriendlyUI
  ? "Advanced sorting & filtering"
  : "Advanced Sorting/Filtering";

const defaultLimit = isFriendlyUI ? 11 : 13;

const applyConstantFilters = (filterSettings: FilterSettings): FilterSettings => {
  if (!isEAForum) {
    return filterSettings;
  }
  const tags = filterSettings.tags.filter(
    ({tagId}) => tagId !== EA_FORUM_TRANSLATION_TOPIC_ID,
  );
  tags.push({
    tagId: EA_FORUM_TRANSLATION_TOPIC_ID,
    tagName: "Translation",
    filterMode: "Hidden",
  });
  return {
    ...filterSettings,
    tags,
  };
}

const getDefaultDesktopFilterSettingsVisibility = (currentUser: UsersCurrent | null, selectedAlgorithm?: string) => {
  if (isFriendlyUI) {
    return false;
  }

  return !currentUser?.hideFrontpageFilterSettingsDesktop;
};

const getDefaultScenario = () => {
  return postFeedsProductionSetting.get()[0].name;
};

const defaultScenarioConfig: RecombeeConfiguration = {
  rotationRate: 0.1,
  rotationTime: 12,
};

function useRecombeeSettings() {
  const [cookies, setCookie] = useCookiesWithConsent();
  const recombeeCookieSettings: RecombeeCookieSettings = cookies[RECOMBEE_SETTINGS_COOKIE] ?? [];
  const [storedActiveScenario, storedActiveScenarioConfig] = recombeeCookieSettings[0] ?? [];
  const [selectedScenario, setSelectedScenario] = useState(storedActiveScenario ?? getDefaultScenario());
  const [scenarioConfig, setScenarioConfig] = useState(storedActiveScenarioConfig ?? defaultScenarioConfig);

  const updateSelectedScenario = (newScenario: string) => {
    // If we don't yet have this cookie, or have this scenario stored in the cookie, add it as the first item
    // Otherwise, reorder the existing scenario + config tuples to have that scenario be first
    const newCookieValue: RecombeeCookieSettings = !recombeeCookieSettings?.find(([scenario]) => newScenario === scenario)
      ? [[newScenario, defaultScenarioConfig], ...(recombeeCookieSettings ?? [])]
      : [...recombeeCookieSettings].sort((a, b) => a[0] === newScenario ? -1 : 0);
    
    setCookie(RECOMBEE_SETTINGS_COOKIE, JSON.stringify(newCookieValue), { path: '/' });

    const [_, newScenarioConfig] = newCookieValue[0];
    setSelectedScenario(newScenario);
    setScenarioConfig(newScenarioConfig);
  };

  const updateScenarioConfig = (newScenarioConfig: RecombeeConfiguration) => {
    const newCookieValue: RecombeeCookieSettings = [...recombeeCookieSettings];
    newCookieValue[0][1] = newScenarioConfig;
    setCookie(RECOMBEE_SETTINGS_COOKIE, JSON.stringify(newCookieValue), { path: '/' });
    setScenarioConfig(newScenarioConfig);
  };

  useEffect(() => {
    if (recombeeCookieSettings.length === 0) {
      setCookie(RECOMBEE_SETTINGS_COOKIE, JSON.stringify([[getDefaultScenario(), defaultScenarioConfig]]), { path: '/' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    selectedScenario, updateSelectedScenario,
    scenarioConfig, updateScenarioConfig
  };
}

function usingClassicLWAlgorithm(selectedScenario: string) {
  return selectedScenario === 'lesswrong-classic';
}

const RecombeeLatestPosts = ({ currentUser, classes }: {
  currentUser: UsersCurrent
  classes: ClassesType<typeof styles>
}) => {
  const {
    SingleColumnSection, PostsList2, TagFilterSettings,
    StickiedPosts, RecombeePostsList, RecombeePostsListSettings, SettingsButton,
    TabPicker, ResolverPostsList, BookmarksList, ContinueReadingList
  } = Components;
  
  const updateCurrentUser = useUpdateCurrentUser();

  const { selectedScenario, updateSelectedScenario, scenarioConfig, updateScenarioConfig } = useRecombeeSettings();
  
  const {filterSettings, setPersonalBlogFilter, setTagFilter, removeTagFilter} = useFilterSettings()
  // While hiding desktop settings is stateful over time, on mobile the filter settings always start out hidden
  // (except that on the EA Forum/FriendlyUI it always starts out hidden)
  const defaultDesktopFilterSettingsVisibility = getDefaultDesktopFilterSettingsVisibility(currentUser, selectedScenario);
  const [filterSettingsVisibleDesktop, setFilterSettingsVisibleDesktop] = useState(defaultDesktopFilterSettingsVisibility);
  const [filterSettingsVisibleMobile, setFilterSettingsVisibleMobile] = useState(false);
  const { captureEvent } = useTracking({eventProps: {recombee: true}}) 
  
  const location = useLocation();
  const { query } = location;

  const { timezone } = useTimezone();
  const now = useCurrentTime();
  const dateCutoff = moment(now).tz(timezone).subtract(frontpageDaysAgoCutoffSetting.get(), 'days').format("YYYY-MM-DD");

  const limit = parseInt(query.limit) || defaultLimit;
  const recentPostsTerms = {
    ...query,
    filterSettings: applyConstantFilters(filterSettings),
    after: dateCutoff,
    view: "magic",
    forum: true,
    limit:limit
  };

  const {continueReading} = useContinueReading()

  const { count: countBookmarks } = useMulti({
    collectionName: "Posts",
    terms: {
      view: "myBookmarkedPosts",
    },
    fragmentName: "PostsListWithVotes",
    fetchPolicy: "cache-and-network",
    skip: !currentUser?._id,
  });


  const changeShowTagFilterSettingsDesktop = () => {
    setFilterSettingsVisibleDesktop(!filterSettingsVisibleDesktop)
    if (isLWorAF) {
      void updateCurrentUser({hideFrontpageFilterSettingsDesktop: filterSettingsVisibleDesktop})
    }
    
    captureEvent("filterSettingsClicked", {
      settings: filterSettings,
      filterSettingsVisible: filterSettingsVisibleDesktop,
      pageSectionContext: "latestPosts",
    })
  };

  const showSettingsButton = (userIsAdmin(currentUser) && selectedScenario.includes('recombee')) || usingClassicLWAlgorithm(selectedScenario);

  const settingsButton = (<div>
    <SettingsButton
      className={classes.hideOnMobile}
      label={filterSettingsVisibleDesktop ?
        filterSettingsToggleLabels.desktopVisible :
        filterSettingsToggleLabels.desktopHidden}
      showIcon={false}
      onClick={changeShowTagFilterSettingsDesktop}
    />
    <SettingsButton
      className={classes.hideOnDesktop}
      label={filterSettingsVisibleMobile ?
        filterSettingsToggleLabels.mobileVisible :
        filterSettingsToggleLabels.mobileHidden}
      showIcon={false}
      onClick={() => {
        setFilterSettingsVisibleMobile(!filterSettingsVisibleMobile)
        captureEvent("filterSettingsClicked", {
          settingsVisible: !filterSettingsVisibleMobile,
          settings: filterSettings,
          pageSectionContext: "latestPosts",
          mobile: true
        })
      }} />
  </div>);

  const availableAlgorithms: TabRecord[] = postFeedsProductionSetting.get().map(feed => ({ name: feed.name, label: feed.label, description: feed.description, disabled: feed.disabled }));

  if (userIsAdmin(currentUser)) {
    const testingFeeds = postFeedsTestingSetting.get().map(feed => ({ name: feed.name, label: feed.label, description: feed.description, disabled: feed.disabled }));
    availableAlgorithms.push(...testingFeeds);
  }

  const enabledAlgorithms = availableAlgorithms
    .filter(feed => !feed.disabled)
    .filter(feed => !(feed.name === 'lesswrong-bookmarks' && (countBookmarks ?? 0) < 1))
    .filter(feed => !(feed.name === 'lesswrong-continue-reading' && continueReading?.length < 1));

  console.log({selectedScenario, availableAlgorithms, enabledAlgorithms, })

  const handleSwitchTab = (tabName: string) => {
    captureEvent("postFeedSwitched", {
      previousTab: selectedScenario,
      newTab: tabName,
    });
    updateSelectedScenario(tabName);
  }

  const algorithmPicker = <TabPicker 
    sortedTabs={enabledAlgorithms} 
    defaultTab={selectedScenario} 
    onTabSelectionUpdate={handleSwitchTab}
    showDescriptionOnHover
  />


  let settings = null;

  if (usingClassicLWAlgorithm(selectedScenario)) { 
    settings = <AnalyticsContext pageSectionContext="tagFilterSettings">
      <div className={classNames({
        [classes.hideOnDesktop]: !filterSettingsVisibleDesktop,
        [classes.hideOnMobile]: !filterSettingsVisibleMobile,
      })}>
        <TagFilterSettings
          filterSettings={filterSettings} setPersonalBlogFilter={setPersonalBlogFilter} setTagFilter={setTagFilter} removeTagFilter={removeTagFilter} flexWrapEndGrow
        />
      </div>
    </AnalyticsContext>
  } else if (selectedScenario.includes('recombee')) {
    settings = <div className={classNames({
      [classes.hideOnDesktop]: !filterSettingsVisibleDesktop,
      [classes.hideOnMobile]: !filterSettingsVisibleMobile,
    })}>
      {userIsAdmin(currentUser) && <RecombeePostsListSettings settings={scenarioConfig} updateSettings={updateScenarioConfig} />}
    </div>
  }

  return (
    // TODO: do we need capturePostItemOnMount here?
    <AnalyticsContext pageSectionContext="postsFeed">
      <SingleColumnSection>
        <div className={classes.settingsVisibilityControls}>
          {algorithmPicker}
          {showSettingsButton && settingsButton}
        </div>
        {settings}
        {isFriendlyUI && <StickiedPosts />}
        {/* TODO: reenable, disabled for testing to see how often duplication happens */}
        <HideRepeatedPostsProvider>
          <AnalyticsContext listContext={"latestPosts"}>
            {/* Allow hiding posts from the front page*/}
            <AllowHidingFrontPagePostsContext.Provider value={true}>

              {/* LATEST POSTS (Hacker News Algorithm) */}
              {(selectedScenario === 'lesswrong-classic') && <AnalyticsContext feedType={selectedScenario}>
                <PostsList2 
                  terms={recentPostsTerms} 
                  alwaysShowLoadMore 
                  hideHiddenFrontPagePosts
                >
                  <Link to={"/allPosts"}>{advancedSortingText}</Link>
                </PostsList2> 
              </AnalyticsContext>}
              
              {/* RECOMBEE RECOMMENDATIONS */}
              {selectedScenario.includes('recombee') && <AnalyticsContext feedType={selectedScenario}>
                <RecombeePostsList algorithm={selectedScenario} settings={scenarioConfig} />
              </AnalyticsContext>}

              {/* BOOKMARKS */}
              {(selectedScenario === 'lesswrong-bookmarks') && <AnalyticsContext feedType={selectedScenario}>
                <BookmarksList showMessageIfEmpty={true} limit={13} />
              </AnalyticsContext>}
              
              {/* CONTINUE READING */}
              {(selectedScenario === 'lesswrong-continue-reading') && (continueReading?.length > 0) && <AnalyticsContext feedType={selectedScenario}>
                <ContinueReadingList continueReading={continueReading}/>
              </AnalyticsContext>}

              {/* SUBSCRIBED */}
              {(selectedScenario === 'lesswrong-subscribed-authors') && <AnalyticsContext feedType={selectedScenario}>
                <ResolverPostsList
                  resolverName="PostsBySubscribedAuthors"
                  limit={13}
                  fallbackText="Visits users' profile pages to subscribe to their posts and comments."
                  showLoadMore
                />
               </AnalyticsContext>}

              {/* CHRONOLIGCAL FEED */}
              {(selectedScenario === 'lesswrong-chronological') && <AnalyticsContext feedType={selectedScenario}>
                <PostsList2 
                  terms={{...recentPostsTerms, view: "new"}} 
                  alwaysShowLoadMore 
                  hideHiddenFrontPagePosts
                >
                  <Link to={"/allPosts"}>{advancedSortingText}</Link>
                </PostsList2> 
              </AnalyticsContext>}

            </AllowHidingFrontPagePostsContext.Provider>
          </AnalyticsContext>
        </HideRepeatedPostsProvider>
      </SingleColumnSection>
    </AnalyticsContext>
  )
}

const RecombeeLatestPostsComponent = registerComponent('RecombeeLatestPosts', RecombeeLatestPosts, {styles});

declare global {
  interface ComponentTypes {
    RecombeeLatestPosts: typeof RecombeeLatestPostsComponent
  }
}
