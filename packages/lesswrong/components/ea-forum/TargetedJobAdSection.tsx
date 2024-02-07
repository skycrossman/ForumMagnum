import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Components, registerComponent } from '../../lib/vulcan-lib';
import moment from 'moment';
import { useIsInView, useTracking } from '../../lib/analyticsEvents';
import { useMessages } from '../common/withMessages';
import { useCurrentUser } from '../common/withUser';
import { useCreate } from '../../lib/crud/withCreate';
import { useMulti } from '../../lib/crud/withMulti';
import { useUpdate } from '../../lib/crud/withUpdate';
import { JOB_AD_DATA } from './TargetedJobAd';
import union from 'lodash/union';
import intersection from 'lodash/intersection';
import { FilterTag, filterModeIsSubscribed } from '../../lib/filterSettings';
import difference from 'lodash/difference';
import { useUpdateCurrentUser } from '../hooks/useUpdateCurrentUser';

/**
 * Section of a page that might display a job ad to the current user.
 */
const TargetedJobAdSection = () => {
  const currentUser = useCurrentUser()
  const updateCurrentUser = useUpdateCurrentUser()
  const { captureEvent } = useTracking()
  // we track when the user has seen the ad
  const { setNode, entry } = useIsInView()
  const { flash } = useMessages()
  const recordCreated = useRef<boolean>(false)

  const { create: createUserJobAd } = useCreate({
    collectionName: 'UserJobAds',
    fragmentName: 'UserJobAdsMinimumInfo',
  })
  const { mutate: updateUserJobAd } = useUpdate({
    collectionName: 'UserJobAds',
    fragmentName: 'UserJobAdsMinimumInfo',
  })
  const { results: userJobAds, loading: userJobAdsLoading } = useMulti({
    terms: {view: 'adsByUser', userId: currentUser?._id},
    collectionName: 'UserJobAds',
    fragmentName: 'UserJobAdsMinimumInfo',
    skip: !currentUser
  })
  
  // we only advertise up to one job per page view
  const [activeJob, setActiveJob] = useState<string>()
  
  // select a job ad to show to the current user
  useMemo(() => {
    if (!currentUser || userJobAdsLoading || activeJob) return
    
    // user's relevant interests from EAG, such as "software engineering"
    // TODO: add this back in once we have the data
    // const userEAGInterests = union(currentUser.experiencedIn, currentUser.interestedIn)
    const ads = userJobAds ?? []
    
    for (let jobName in JOB_AD_DATA) {
      // skip any jobs where the deadline to apply has passed
      const deadline = JOB_AD_DATA[jobName].deadline
      if (deadline && moment().isAfter(deadline, 'day')) {
        continue
      }

      const tagsReadIds = JOB_AD_DATA[jobName].tagsReadIds
      const jobAdState = ads.find(ad => ad.jobName === jobName)?.adState
      // check if the ad fits the user's interests -
      // currently based on whether they have subscribed to all the topics relevant to the job ad
      const userTagSubs = currentUser.frontpageFilterSettings?.tags?.filter(
        (setting: FilterTag) => filterModeIsSubscribed(setting.filterMode)
      )?.map((setting: FilterTag) => setting.tagId)
      const userIsMatch = tagsReadIds && !difference(tagsReadIds, userTagSubs).length
      // TODO: We probably want to enable this, but not in the initial release, so commenting out for now.
      // const userIsMatch = coreTagReads &&
      //   tagsReadIds?.every(
      //     tagId => coreTagReads.some(tag => tag.tagId === tagId && tag.userReadCount >= 12)
      //   )

      // make sure the user hasn't already clicked "apply" or "remind me" for this ad
      const shouldShowAd = !jobAdState || ['seen', 'expanded'].includes(jobAdState)

      if (userIsMatch && shouldShowAd) {
        setActiveJob(jobName)
        return
      }
    }
    
  }, [currentUser, userJobAds, userJobAdsLoading, activeJob])

  // record when this user has seen the selected ad
  useEffect(() => {
    // skip when no data to record
    if (!currentUser || userJobAdsLoading || !activeJob || !entry?.isIntersecting) return
    // skip if we have already recorded this data
    if (recordCreated.current || userJobAds?.some(ad => ad.jobName === activeJob)) return
    // make sure to only create up to one record per view
    recordCreated.current = true
    void createUserJobAd({
      data: {
        userId: currentUser._id,
        jobName: activeJob,
        adState: 'seen'
      }
    })
  }, [currentUser, userJobAds, userJobAdsLoading, activeJob, entry, createUserJobAd])
  
  const dismissJobAd = useCallback(() => {
    captureEvent('hideJobAd')
    void updateCurrentUser({hideJobAdUntil: moment().add(30, 'days').toDate()})
  }, [captureEvent, updateCurrentUser])
  
  const handleExpand = useCallback(() => {
    if (!currentUser || !userJobAds?.length || !activeJob) return
    // record when a user has expanded the selected ad
    const ad = userJobAds.find(ad => ad.jobName === activeJob)
    if (ad) {
      void updateUserJobAd({
        selector: {_id: ad._id},
        data: {
          adState: 'expanded'
        }
      })
    }
  }, [currentUser, userJobAds, activeJob, updateUserJobAd])
  
  const handleApply = useCallback(() => {
    if (!currentUser || !userJobAds?.length || !activeJob) return
    // record when a user has clicked the "Apply" button
    const ad = userJobAds.find(ad => ad.jobName === activeJob)
    if (ad) {
      void updateUserJobAd({
        selector: {_id: ad._id},
        data: {
          adState: 'applied'
        }
      })
    }
  }, [currentUser, userJobAds, activeJob, updateUserJobAd])
  
  const handleRemindMe = useCallback(() => {
    if (!currentUser || !userJobAds?.length || !activeJob) return
    // record when a user has clicked the "Remind me" button
    const ad = userJobAds.find(ad => ad.jobName === activeJob)
    if (ad) {
      // email is sent via callback or cron depending on how soon the deadline is
      void updateUserJobAd({
        selector: {_id: ad._id},
        data: {
          adState: 'reminderSet'
        }
      })
    }
    flash({messageString: "We'll email you about this job before the application deadline", type: "success"})
  }, [currentUser, userJobAds, activeJob, updateUserJobAd, flash])
  
  const { TargetedJobAd } = Components
  
  // Only show this section if we have a matching job for this user
  if (
    !currentUser ||
    (currentUser.hideJobAdUntil && moment(currentUser.hideJobAdUntil).isAfter(moment())) ||
    !activeJob
  ) {
    return null
  }
  
  return <div ref={setNode}>
    <TargetedJobAd
      ad={activeJob}
      onDismiss={dismissJobAd}
      onExpand={handleExpand}
      onApply={handleApply}
      onRemindMe={handleRemindMe}
    />
  </div>
}

const TargetedJobAdSectionComponent = registerComponent("TargetedJobAdSection", TargetedJobAdSection);

declare global {
  interface ComponentTypes {
    TargetedJobAdSection: typeof TargetedJobAdSectionComponent
  }
}
