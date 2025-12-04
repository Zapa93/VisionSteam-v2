export interface Channel {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
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