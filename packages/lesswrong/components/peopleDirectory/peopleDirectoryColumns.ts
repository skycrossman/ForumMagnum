import type { ComponentProps } from "react";

const cellComponents = [
  "PeopleDirectoryUserCell",
  "PeopleDirectoryTextCell",
  "PeopleDirectoryDateCell",
  "PeopleDirectoryNumberCell",
  "PeopleDirectorySocialMediaCell",
  "PeopleDirectoryCareerStageCell",
  "PeopleDirectorySkeletonUserCell",
  "PeopleDirectorySkeletonTextCell",
] as const;

type CellComponentName = typeof cellComponents[number];

type PeopleDirectoryColumnState = {
  hideable: false,
} | {
  hideable: true,
  hidden: boolean,
}

export type PeopleDirectoryColumn<
  T extends CellComponentName = CellComponentName,
  S extends CellComponentName = CellComponentName
> = {
  label: string,
  shortLabel?: string,
  sortField?: string,
  columnWidth?: string,
  componentName: T,
  props?: Omit<ComponentProps<ComponentTypes[T]>, "user">,
  skeletonComponentName?: S,
  skeletonProps?: Omit<ComponentProps<ComponentTypes[S]>, "user">,
} & PeopleDirectoryColumnState;

export const peopleDirectoryColumns: PeopleDirectoryColumn<CellComponentName>[] = [
  {
    label: "Name",
    sortField: "displayName.sort",
    columnWidth: "220px",
    componentName: "PeopleDirectoryUserCell",
    skeletonComponentName: "PeopleDirectorySkeletonUserCell",
    hideable: false,
  },
  {
    label: "Role",
    sortField: "jobTitle.sort",
    componentName: "PeopleDirectoryTextCell",
    props: {
      fieldName: "jobTitle",
    },
    hideable: true,
    hidden: false,
  },
  {
    label: "Organization",
    sortField: "organization.sort",
    componentName: "PeopleDirectoryTextCell",
    props: {
      fieldName: "organization",
    },
    hideable: true,
    hidden: false,
  },
  {
    label: "Bio",
    columnWidth: "1.5fr",
    componentName: "PeopleDirectoryTextCell",
    props: {
      fieldName: "bio",
    },
    skeletonComponentName: "PeopleDirectorySkeletonTextCell",
    skeletonProps: {
      lines: 2,
    },
    hideable: true,
    hidden: false,
  },
  {
    label: "Social media",
    columnWidth: "100px",
    componentName: "PeopleDirectorySocialMediaCell",
    hideable: true,
    hidden: false,
  },
  {
    label: "Career stage",
    columnWidth: "auto",
    componentName: "PeopleDirectoryCareerStageCell",
    hideable: true,
    hidden: false,
  },
  {
    label: "Karma",
    columnWidth: "80px",
    componentName: "PeopleDirectoryNumberCell",
    props: {
      fieldName: "karma",
    },
    hideable: true,
    hidden: false,
  },
  {
    label: "Location",
    componentName: "PeopleDirectoryTextCell",
    props: {
      fieldName: "mapLocationAddress",
    },
    hideable: true,
    hidden: true,
  },
  {
    label: "Profile last updated",
    shortLabel: "Profile updated",
    columnWidth: "120px",
    componentName: "PeopleDirectoryDateCell",
    props: {
      fieldName: "profileUpdatedAt",
      format: "MMM YYYY",
    },
    hideable: true,
    hidden: false,
  },
];
