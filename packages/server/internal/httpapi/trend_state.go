package httpapi

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
	"unicode/utf16"
)

func fields(raw json.RawMessage, keys ...string) (map[string]json.RawMessage, error) {
	var m map[string]json.RawMessage
	if json.Unmarshal(raw, &m) != nil || len(m) != len(keys) {
		return nil, errors.New("invalid fields")
	}
	for _, k := range keys {
		if m[k] == nil || string(m[k]) == "null" {
			return nil, errors.New("missing field")
		}
	}
	return m, nil
}
func text(raw json.RawMessage) (string, bool) {
	var s string
	err := json.Unmarshal(raw, &s)
	return s, err == nil && len(utf16.Encode([]rune(s))) <= 200
}
func number(raw json.RawMessage) (float64, bool) {
	var v float64
	err := json.Unmarshal(raw, &v)
	return v, err == nil && !math.IsNaN(v) && !math.IsInf(v, 0)
}
func boolean(raw json.RawMessage) bool {
	return string(raw) == "true" || string(raw) == "false"
}
func oneOf(raw json.RawMessage, values ...string) bool {
	s, ok := text(raw)
	if !ok {
		return false
	}
	for _, v := range values {
		if s == v {
			return true
		}
	}
	return false
}
func validTrendState(raw json.RawMessage) bool {
	if len(raw) > 2*1024*1024 {
		return false
	}
	m, err := fields(raw, "version", "categories", "selectedId")
	if err != nil || string(m["version"]) != "1" {
		return false
	}
	selected, ok := text(m["selectedId"])
	if !ok {
		return false
	}
	var categories []json.RawMessage
	if json.Unmarshal(m["categories"], &categories) != nil || len(categories) < 1 || len(categories) > 50 {
		return false
	}
	ids := map[string]bool{}
	for _, rawCategory := range categories {
		c, err := fields(rawCategory, "id", "name", "kind", "xMetric", "yMetric", "xLabel", "yLabel", "threshold", "onDashboard", "items")
		if err != nil {
			return false
		}
		id, valid := text(c["id"])
		name, named := text(c["name"])
		if !valid || id == "" || ids[id] || !named || strings.TrimSpace(name) == "" {
			return false
		}
		ids[id] = true
		if !oneOf(c["kind"], "nutrition", "custom") || !boolean(c["onDashboard"]) {
			return false
		}
		for _, axis := range []string{"x", "y"} {
			if _, valid := text(c[axis+"Label"]); !valid {
				return false
			}
			if oneOf(c["kind"], "custom") {
				if !oneOf(c[axis+"Metric"], axis) {
					return false
				}
			} else if !oneOf(c[axis+"Metric"], "price100g", "kcal100g", "kcalPerYuan", "cost100kcal", "price", "weight") {
				return false
			}
		}
		t, err := fields(c["threshold"], "enabled", "axis", "direction", "value")
		if err != nil || !boolean(t["enabled"]) || !oneOf(t["axis"], "x", "y") || !oneOf(t["direction"], "above", "below") {
			return false
		}
		if _, valid := number(t["value"]); !valid {
			return false
		}
		var items []json.RawMessage
		if json.Unmarshal(c["items"], &items) != nil || string(c["items"]) == "null" || len(items) > 500 {
			return false
		}
		itemIDs := map[string]bool{}
		for _, rawItem := range items {
			item, err := fields(rawItem, "id", "name", "price", "weight", "energy", "energyUnit", "x", "y")
			if err != nil {
				return false
			}
			itemID, valid := text(item["id"])
			if !valid || itemID == "" || itemIDs[itemID] || !oneOf(item["energyUnit"], "kJ", "kcal") {
				return false
			}
			itemIDs[itemID] = true
			if _, valid := text(item["name"]); !valid {
				return false
			}
			for _, k := range []string{"price", "weight", "energy", "x", "y"} {
				v, valid := number(item[k])
				if !valid || ((k == "price" || k == "energy") && v < 0) || (k == "weight" && v <= 0) {
					return false
				}
			}
		}
	}
	return ids[selected]
}
