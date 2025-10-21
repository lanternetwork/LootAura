'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type SalesShellProps = {
  Filters: React.ReactNode
  Map: React.ReactNode
  List: React.ReactNode
}

export default function SalesShell({ Filters, Map, List }: SalesShellProps) {
  const [activeTab, setActiveTab] = useState<'map' | 'list'>('map')

  return (
    <>
      {/* Desktop & Tablet Layout */}
      <div className="hidden md:flex flex-col h-[calc(100vh-var(--app-header,64px))]">
        {/* Sticky Filters Bar */}
        <div className="sticky top-[var(--app-header,64px)] z-30 bg-white/80 backdrop-blur border-b">
          {Filters}
        </div>
        
        {/* Main Content Grid */}
        <div className="flex-1 grid grid-cols-[1fr_minmax(380px,40%)] gap-0">
          {/* Map Area */}
          <div className="relative">
            {Map}
          </div>
          
          {/* List Area */}
          <div className="border-l bg-white overflow-y-auto">
            {List}
          </div>
        </div>
      </div>

      {/* Tablet Layout */}
      <div className="hidden lg:hidden md:flex flex-col h-[calc(100vh-var(--app-header,64px))]">
        {/* Sticky Filters Bar */}
        <div className="sticky top-[var(--app-header,64px)] z-30 bg-white/80 backdrop-blur border-b">
          {Filters}
        </div>
        
        {/* Main Content Grid */}
        <div className="flex-1 grid grid-cols-[1fr_minmax(320px,45%)] gap-0">
          {/* Map Area */}
          <div className="relative">
            {Map}
          </div>
          
          {/* List Area */}
          <div className="border-l bg-white overflow-y-auto">
            {List}
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'map' | 'list')} className="h-[calc(100vh-var(--app-header,64px))]">
          {/* Mobile Filters + Tabs */}
          <div className="sticky top-[var(--app-header,64px)] z-30 bg-white/80 backdrop-blur border-b">
            {Filters}
            <TabsList className="w-full">
              <TabsTrigger value="map" className="flex-1">Map</TabsTrigger>
              <TabsTrigger value="list" className="flex-1">List</TabsTrigger>
            </TabsList>
          </div>
          
          {/* Map Tab */}
          <TabsContent value="map" className="h-[calc(100%-var(--filters-height,120px))] m-0">
            <div className="relative h-full">
              {Map}
            </div>
          </TabsContent>
          
          {/* List Tab */}
          <TabsContent value="list" className="h-[calc(100%-var(--filters-height,120px))] m-0 overflow-y-auto">
            {List}
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
