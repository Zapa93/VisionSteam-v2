export interface Channel {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  tvgId?: string;
}

export interface ChannelGroup {
  title: string;
  channels: Channel[];
}

export enum Category {
  KANALER = 'Kanaler',
  FOTBOLL = 'Fotboll'
}

export type PlaylistData = ChannelGroup[];

export interface EPGProgram {
  id: string; // tvg-id
  title: string;
  description: string;
  start: Date;
  end: Date;
}

export interface EPGData {
  [tvgId: string]: EPGProgram[];
}