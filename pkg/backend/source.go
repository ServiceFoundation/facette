package backend

import (
	"log"
)

// An Source represents the source of a set of Metric entries (e.g. an host name).
type Source struct {
	Name         string
	OriginalName string
	Metrics      map[string]*Metric
	origin       *Origin
}

// AppendMetric adds a new Metric entry into the Source instance.
func (source *Source) AppendMetric(name, origName string) *Metric {
	var (
		metric *Metric
	)

	if source.origin.catalog.debugLevel > 2 {
		log.Printf("DEBUG: appending `%s' metric for `%s' source...\n", name, source.Name)
	}

	// Append new metric instance into source
	metric = &Metric{Name: name, OriginalName: origName, source: source}
	source.Metrics[name] = metric

	return metric
}