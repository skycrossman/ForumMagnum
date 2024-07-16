import React, { useCallback, useEffect, useState } from "react";
import { Components, registerComponent } from "../../lib/vulcan-lib";
import { useCurrentUser } from "../common/withUser";
import { AnalyticsContext, useTracking } from "../../lib/analyticsEvents";
import { useCookiesWithConsent } from "../hooks/useCookiesWithConsent";
import moment from "moment";
import ForumNoSSR from "../common/ForumNoSSR";
import { HIDE_EAG_BANNER_COOKIE } from "@/lib/cookies/cookies";
import { Link } from "@/lib/reactRouterWrapper";
import { useUserLocation } from "@/lib/collections/users/helpers";
import { distance } from "../community/modules/LocalGroups";
import { getCachedUserCountryCode } from "../common/CookieBanner/geolocation";
import { lightbulbIcon } from "../icons/lightbulbIcon";

const styles = (theme: ThemeType) => ({
  root: {
    display: "flex",
    justifyContent: "space-between",
    columnGap: "10px",
    padding: '10px 10px 10px 12px',
    backgroundColor: theme.palette.grey[200],
    fontFamily: theme.palette.fonts.sansSerifStack,
    fontSize: 15,
    lineHeight: '22px',
    fontWeight: 450,
    borderRadius: theme.borderRadius.default,
    marginBottom: 20,
  },
  lightbulb: {
    flex: 'none',
    height: 30,
    width: 30,
    alignSelf: 'center',
    color: theme.palette.buttons.alwaysPrimary,
  },
  content: {
    flexGrow: 1,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    columnGap: 6,
    fontSize: 13,
    lineHeight: '17px',
    opacity: 0.5,
    marginBottom: 2,
  },
  infoIcon: {
    fontSize: 14,
    transform: 'translateY(2px)',
  },
  bold: {
    fontWeight: 700,
  },
  link: {
    textDecoration: 'underline',
  },
  applyLink: {
    color: theme.palette.buttons.alwaysPrimary,
    fontWeight: 600,
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    whiteSpace: 'nowrap',
    '&:hover': {
      textDecoration: 'underline',
      opacity: 0.75,
    },
  },
  close: {
    flex: 'none',
    fontSize: 20,
    cursor: "pointer",
    marginLeft: 13,
    "&:hover": {
      opacity: 0.75,
    },
  },
});

// This is the data for the next EAGx (Toronto, CA)
const eagName = 'EAGxToronto'
const eagLocation = {
  lat: 43.6532,
  lng: -79.3832,
}
const eagCountry = 'CA'
const eagPostLink = "/events/WGeby2GfMHH8jXmMY/eagxtoronto"
const eagLink = "https://www.effectivealtruism.org/ea-global/events/eagxtoronto-2024"
const applicationDeadline = moment.utc('2024-07-31', 'YYYY-MM-DD')


/**
 * This is an experimental banner at the top of the EA Forum homepage.
 * We are considering displaying a small banner when an EAG(x) application deadline is near,
 * visible only to users who we think are in a relevant location for that conference.
 */
const EAGBanner = ({classes}: {classes: ClassesType}) => {
  const [cookies, setCookie] = useCookiesWithConsent([HIDE_EAG_BANNER_COOKIE]);
  const {captureEvent} = useTracking();
  const currentUser = useCurrentUser();
  
  // Try to get the user's location from:
  // 1. (logged in user) user settings
  // 2. (logged out user) browser's local storage
  // 3. country code in local storage, which is also used by the cookie banner
  const userLocation = useUserLocation(currentUser, true)
  const [countryCode, setCountryCode] = useState<string|null>(null)
  useEffect(() => {
    // Get the country code from local storage
    setCountryCode(getCachedUserCountryCode())
  }, [])

  const hideBanner = useCallback(() => {
    setCookie(HIDE_EAG_BANNER_COOKIE, "true", {
      expires: moment().add(1, "months").toDate(),
    });
  }, [setCookie]);

  const onDismissBanner = useCallback(() => {
    hideBanner();
    captureEvent("eag_banner_dismissed");
  }, [hideBanner, captureEvent]);

  // This EAG(x) is relevant to the user if they are within 500 miles of it,
  // or they live in relevant/nearby countries.
  const userLocationNearby = userLocation.known && (distance(eagLocation, userLocation, 'mi') < 500)
  const userInCountry = countryCode === eagCountry
  const isRelevant = userLocationNearby || userInCountry
  if (
    moment.utc().isAfter(applicationDeadline, 'day') ||
    cookies[HIDE_EAG_BANNER_COOKIE] === "true" ||
    !isRelevant
  ) {
    return null;
  }

  const {AnalyticsInViewTracker, SingleColumnSection, LWTooltip, HoverPreviewLink, ForumIcon} = Components;
  
  const inViewEventProps = {
    inViewType: `${eagName}Banner`,
    reason: userLocationNearby && userInCountry ? 'both' : userLocationNearby ? 'nearby' : 'country'
  }

  return (
    <ForumNoSSR if={!currentUser}>
      <AnalyticsContext pageElementContext="EAGBanner">
        <AnalyticsInViewTracker eventProps={inViewEventProps}>
          <SingleColumnSection className={classes.root}>
            <div className={classes.lightbulb}>{lightbulbIcon}</div>
            <div className={classes.content}>
              <div className={classes.topRow}>
                Upcoming conference near you
                <LWTooltip title={
                    <>
                      You're seeing this recommendation because of your location.{" "}
                      {userLocationNearby && <>
                        You can update your account location via your{" "}
                        <Link to="/account?highlightField=googleLocation" className={classes.link}>
                          account settings
                        </Link>.
                      </>}
                    </>
                  }
                  clickable={userLocationNearby}
                >
                  <ForumIcon icon="QuestionMarkCircle" className={classes.infoIcon} />
                </LWTooltip>
              </div>
              <div className={classes.bottomRow}>
                <HoverPreviewLink href={eagPostLink}>
                  <span className={classes.bold}>{eagName}</span>
                </HoverPreviewLink>{" "}
                applications close on {applicationDeadline.format('ddd MMMM D')} &#8212;{" "}
                <Link to={eagLink} className={classes.applyLink}>
                  apply now
                </Link>
              </div>
            </div>
            <ForumIcon
              icon="Close"
              onClick={onDismissBanner}
              className={classes.close}
            />
          </SingleColumnSection>
        </AnalyticsInViewTracker>
      </AnalyticsContext>
    </ForumNoSSR>
  );
}

const EAGBannerComponent = registerComponent(
  "EAGBanner",
  EAGBanner,
  {styles},
);

declare global {
  interface ComponentTypes {
    EAGBanner: typeof EAGBannerComponent
  }
}
